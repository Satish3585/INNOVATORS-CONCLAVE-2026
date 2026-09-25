import asyncio
import os
import sys
from scripts.seed import seed

if __name__ == "__main__":
    password = os.getenv("FARMAI_DEMO_PASSWORD", "FarmAI@DevTest2026")
    asyncio.run(seed(password))
