from datetime import datetime
from unittest import mock

from django.conf import settings
from django.test import override_settings

from sentry.constants import DataCategory
from sentry.ingest.billing_metrics_consumer import get_metrics_billing_consumer
from sentry.sentry_metrics.indexer.strings import TRANSACTION_METRICS_NAMES
from sentry.utils import json
from sentry.utils.outcomes import Outcome


@mock.patch("sentry.ingest.billing_metrics_consumer.track_outcome")
def test_outcomes_consumed(track_outcome, kafka_producer, kafka_admin):
    # Based on test_ingest_consumer_kafka.py

    metrics_topic = "snuba-generic-metrics"

    admin = kafka_admin(settings)
    admin.delete_topic(metrics_topic)
    producer = kafka_producer(settings)

    with override_settings(
        KAFKA_CONSUMER_AUTO_CREATE_TOPICS=True,
    ):

        buckets = [
            {  # Counter metric with wrong ID will not generate an outcome
                "metric_id": 123,
                "type": "c",
                "org_id": 1,
                "project_id": 2,
                "timestamp": 123,
                "value": 123.4,
            },
            {  # Distribution metric with wrong ID will not generate an outcome
                "metric_id": 123,
                "type": "d",
                "org_id": 1,
                "project_id": 2,
                "timestamp": 123,
                "value": [1.0, 2.0],
            },
            {  # Empty distribution will not generate an outcome
                # NOTE: Should not be emitted by Relay anyway
                "metric_id": TRANSACTION_METRICS_NAMES["d:transactions/duration@millisecond"],
                "type": "d",
                "org_id": 1,
                "project_id": 2,
                "timestamp": 123,
                "value": [],
            },
            {  # Valid distribution bucket emits an outcome
                "metric_id": TRANSACTION_METRICS_NAMES["d:transactions/duration@millisecond"],
                "type": "d",
                "org_id": 1,
                "project_id": 2,
                "timestamp": 123456,
                "value": [1.0, 2.0, 3.0],
            },
        ]

        producer = kafka_producer(settings)
        for bucket in buckets:
            producer.produce(metrics_topic, json.dumps(bucket))
        producer.flush()

        metrics_consumer = get_metrics_billing_consumer(
            topic=metrics_topic,
            group_id="some_group_id",
            auto_offset_reset="earliest",
            force_topic=None,
            force_cluster=None,
        )

        calls = track_outcome.mock_calls
        for i in range(100):
            metrics_consumer._run_once()
            if calls:
                assert calls == [
                    mock.call(
                        org_id=1,
                        project_id=2,
                        key_id=None,
                        outcome=Outcome.ACCEPTED,
                        reason=None,
                        timestamp=datetime(1970, 1, 2, 10, 17, 36),
                        event_id=None,
                        category=DataCategory.TRANSACTION_PROCESSED,
                        quantity=3,
                    )
                ]
                break
