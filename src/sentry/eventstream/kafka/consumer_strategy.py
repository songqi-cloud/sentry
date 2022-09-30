import logging
import time
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Deque, Mapping, MutableMapping, Optional, Tuple

from arroyo.backends.kafka.consumer import KafkaPayload
from arroyo.processing.strategies import ProcessingStrategy, ProcessingStrategyFactory
from arroyo.processing.strategies.abstract import MessageRejected
from arroyo.types import Message, Partition, Position

from sentry import options
from sentry.eventstream.kafka.postprocessworker import (
    _sampled_eventstream_timer,
    dispatch_post_process_group_task,
)
from sentry.eventstream.kafka.protocol import (
    get_task_kwargs_for_message,
    get_task_kwargs_for_message_from_headers,
)
from sentry.utils import metrics

COMMIT_FREQUENCY_SEC = 1

_DURATION_METRIC = "eventstream.duration"

logger = logging.getLogger(__name__)


def _get_task_kwargs(message: Message[KafkaPayload]) -> Optional[Mapping[str, Any]]:
    use_kafka_headers = options.get("post-process-forwarder:kafka-headers")

    if use_kafka_headers:
        try:
            with _sampled_eventstream_timer(instance="get_task_kwargs_for_message_from_headers"):
                return get_task_kwargs_for_message_from_headers(message.payload.headers)
        except Exception as error:
            logger.warning("Could not forward message: %s", error, exc_info=True)
            with metrics.timer(_DURATION_METRIC, instance="get_task_kwargs_for_message"):
                return get_task_kwargs_for_message(message.payload.value)
    else:
        with metrics.timer(_DURATION_METRIC, instance="get_task_kwargs_for_message"):
            return get_task_kwargs_for_message(message.payload.value)


def _get_task_kwargs_and_dispatch(message: Message[KafkaPayload]) -> None:
    task_kwargs = _get_task_kwargs(message)
    if not task_kwargs:
        return None

    dispatch_post_process_group_task(**task_kwargs)


class DispatchTask(ProcessingStrategy[KafkaPayload]):
    def __init__(
        self, concurrency: int, commit: Callable[[Mapping[Partition, Position]], None]
    ) -> None:
        self.__executor = ThreadPoolExecutor(max_workers=concurrency)
        self.__futures: Deque[Tuple[Message[KafkaPayload], Future[None]]] = deque()
        self.__max_pending_futures = concurrency * 2
        self.__commit = commit
        self.__commit_data: MutableMapping[Partition, Position] = {}
        self.__last_committed: Optional[float] = None
        self.__closed = False

    def submit(self, message: Message[KafkaPayload]) -> None:
        assert not self.__closed
        # The list of pending futures is too long, tell the stream processor to slow down
        if len(self.__futures) > self.__max_pending_futures:
            raise MessageRejected

        self.__futures.append(
            (message, self.__executor.submit(_get_task_kwargs_and_dispatch, message))
        )

    def poll(self) -> None:
        # Remove completed futures in order
        while self.__futures and self.__futures[0][1].done():
            message, _ = self.__futures.popleft()

            self.__commit_data[message.partition] = Position(message.next_offset, message.timestamp)

        self.__throttled_commit()

    def __throttled_commit(self, force: bool = False) -> None:
        # Commits all offsets and resets self.__commit_data at most
        # every COMMIT_FREQUENCY_SEC. If force=True is passed, the
        # commit frequency is ignored and we immediately commit.

        now = time.time()

        if (
            self.__last_committed is None
            or now - self.__last_committed >= COMMIT_FREQUENCY_SEC
            or force is True
        ):
            if self.__commit_data:
                self.__commit(self.__commit_data)
                self.__last_committed = now
                self.__commit_data = {}

    def join(self, timeout: Optional[float] = None) -> None:
        start = time.time()

        # Commit all pending offsets
        self.__throttled_commit(force=True)

        while self.__futures:
            remaining = timeout - (time.time() - start) if timeout is not None else None
            if remaining is not None and remaining <= 0:
                logger.warning(f"Timed out with {len(self.__futures)} futures in queue")
                break

            message, future = self.__futures.popleft()

            future.result(remaining)

            self.__commit({message.partition: Position(message.offset, message.timestamp)})

        self.__executor.shutdown()

    def close(self) -> None:
        self.__closed = True

    def terminate(self) -> None:
        self.__closed = True
        self.__executor.shutdown()


class PostProcessForwarderStrategyFactory(ProcessingStrategyFactory[KafkaPayload]):
    def __init__(
        self,
        concurrency: int,
    ):
        self.__concurrency = concurrency

    def create_with_partitions(
        self,
        commit: Callable[[Mapping[Partition, Position]], None],
        partitions: Mapping[Partition, int],
    ) -> ProcessingStrategy[KafkaPayload]:
        return DispatchTask(self.__concurrency, commit)
