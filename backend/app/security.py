from datetime import datetime, timedelta, timezone
from uuid import uuid4
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from pymongo.database import Database as SyncDatabase
from app.config import settings
from app.database import get_db

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except Exception:
        return False


def create_access_token(user_id: str, role: str, jti: str) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode({"sub": user_id, "role": role, "jti": jti, "iat": datetime.now(timezone.utc), "exp": expires}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires


async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id, jti = payload.get("sub"), payload.get("jti")
        if not user_id or not jti:
            raise ValueError("Missing token identity")
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    session = await db.sessions.find_one({"jti": jti, "user_id": user_id, "revoked_at": None})
    if not session:
        raise HTTPException(status_code=401, detail="Session is no longer active", headers={"WWW-Authenticate": "Bearer"})
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id), "status": "active"}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Account unavailable")
    return user


def require_roles(*roles: str):
    async def role_guard(user=Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role permissions")
        return user
    return role_guard
