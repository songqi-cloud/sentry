from sentry.services.hybrid_cloud import silo_mode_delegation, stubbed
from sentry.silo import SiloMode

from .manager import (  # NOQA
    DEFAULT_FLAGS,
    FLAG_ALLOW_EMPTY,
    FLAG_CREDENTIAL,
    FLAG_IMMUTABLE,
    FLAG_NOSTORE,
    FLAG_PRIORITIZE_DISK,
    FLAG_REQUIRED,
    FLAG_STOREONLY,
    OptionsManager,
    UnknownOption,
)
from .store import AbstractOptionsStore, OptionsStore

__all__ = (
    "get",
    "set",
    "delete",
    "register",
    "isset",
    "lookup_key",
    "UnknownOption",
    "default_store",
)

# See notes in ``runner.initializer`` regarding lazy cache configuration.
_local_store_impl = OptionsStore(cache=None)


def impl_locally() -> AbstractOptionsStore:
    return _local_store_impl


# An abstraction for hybrid cloud.  Currently, under the hood, all silo modes still use the original options store.
# However, to allow tests to validate abstraction for future silo separation, we need to use a delegator that can,
# eventually, use a new implementation.
default_store: AbstractOptionsStore = silo_mode_delegation(
    {
        SiloMode.MONOLITH: impl_locally,
        SiloMode.REGION: stubbed(impl_locally, SiloMode.CONTROL),
        SiloMode.CONTROL: impl_locally,
    }
)

default_store.connect_signals()

default_manager = OptionsManager(store=default_store)

# expose public API
get = default_manager.get
set = default_manager.set
delete = default_manager.delete
register = default_manager.register
all = default_manager.all
filter = default_manager.filter
isset = default_manager.isset
lookup_key = default_manager.lookup_key


def load_defaults():
    from . import defaults  # NOQA
