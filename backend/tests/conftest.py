import pytest
import mongomock
from fastapi.testclient import TestClient
from app.main import app
from app.database import Database, get_db


class AsyncCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def sort(self, *args, **kwargs):
        self.cursor = self.cursor.sort(*args, **kwargs)
        return self

    def skip(self, *args, **kwargs):
        self.cursor = self.cursor.skip(*args, **kwargs)
        return self

    def limit(self, *args, **kwargs):
        self.cursor = self.cursor.limit(*args, **kwargs)
        return self

    async def to_list(self, length=None):
        docs = list(self.cursor)
        return docs[:length] if length is not None else docs


class AsyncCollectionWrapper:
    def __init__(self, coll):
        self._coll = coll

    def __getattr__(self, name):
        attr = getattr(self._coll, name)
        if callable(attr):
            async def async_fn(*args, **kwargs):
                return attr(*args, **kwargs)
            return async_fn
        return attr

    def find(self, *args, **kwargs):
        return AsyncCursorWrapper(self._coll.find(*args, **kwargs))


class AsyncDatabaseWrapper:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return AsyncCollectionWrapper(self._db[name])

    def __getitem__(self, name):
        return AsyncCollectionWrapper(self._db[name])


@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    sync_db = client["farmai_test"]
    async_db = AsyncDatabaseWrapper(sync_db)
    original_db = Database.db
    Database.db = async_db

    async def override_get_db():
        yield async_db

    app.dependency_overrides[get_db] = override_get_db
    yield async_db

    app.dependency_overrides.pop(get_db, None)
    Database.db = original_db


@pytest.fixture
def client(mock_db):
    with TestClient(app) as c:
        yield c
