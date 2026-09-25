import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
import httpx
from app.config import settings

logger = logging.getLogger("farmai.ai")


class AIProvider(ABC):
    @abstractmethod
    async def chat(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        """Send chat messages and receive text response."""
        pass

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if AI provider is reachable and ready."""
        pass


class OllamaProvider(AIProvider):
    def __init__(self, base_url: str, model: str, timeout: int = 120):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def chat(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        url = f"{self.base_url}/api/chat"
        # Format messages for Ollama API
        formatted_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                # Text aggregation if structured blocks
                text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and "text" in part]
                content = "\n".join(text_parts)
            formatted_messages.append({"role": role, "content": str(content)})

        payload = {
            "model": self.model,
            "messages": formatted_messages,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 350},
        }

        try:
            async with httpx.AsyncClient(timeout=float(self.timeout)) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    return data.get("message", {}).get("content")
                logger.warning(f"Ollama returned status {response.status_code}: {response.text}")
                return None
        except Exception as e:
            logger.warning(f"Failed to communicate with Ollama at {self.base_url}: {e}")
            return None


class GeminiProvider(AIProvider):
    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-3.5-flash", timeout: int = 60):
        self.api_key = (api_key or "").strip()
        self.model = (model or "gemini-3.5-flash").strip()
        self.timeout = timeout

    async def is_available(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("your_"))

    async def chat(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        if not await self.is_available():
            return None

        contents = []
        system_context = ""

        for msg in messages:
            role = msg.get("role", "user")
            raw_content = msg.get("content", "")

            if isinstance(raw_content, list):
                text_parts = [part.get("text", "") for part in raw_content if isinstance(part, dict) and "text" in part]
                content_text = "\n".join(text_parts)
            else:
                content_text = str(raw_content)

            if role == "system":
                system_context += f"{content_text}\n"
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": content_text}]})
            else:
                contents.append({"role": "user", "parts": [{"text": content_text}]})

        if not contents:
            contents.append({"role": "user", "parts": [{"text": system_context or "Hello"}]})
        elif system_context:
            first_user_idx = next((i for i, c in enumerate(contents) if c["role"] == "user"), None)
            if first_user_idx is not None:
                orig_text = contents[first_user_idx]["parts"][0]["text"]
                contents[first_user_idx]["parts"][0]["text"] = f"[System Context]\n{system_context}\n\n[Farmer Inquiry]\n{orig_text}"

        clean_model = self.model
        if clean_model.startswith("models/"):
            clean_model = clean_model[len("models/"):]

        candidates = [clean_model]
        for fallback in ["gemini-3.5-flash", "gemini-flash-latest"]:
            if fallback not in candidates:
                candidates.append(fallback)

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1000,
            }
        }

        async with httpx.AsyncClient(timeout=float(self.timeout)) as client:
            for candidate in candidates:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate}:generateContent?key={self.api_key}"
                try:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates_list = data.get("candidates", [])
                        if candidates_list:
                            parts = candidates_list[0].get("content", {}).get("parts", [])
                            if parts:
                                return parts[0].get("text")
                    logger.warning(f"Gemini API ({candidate}) returned status {res.status_code}: {res.text[:200]}")
                except Exception as e:
                    logger.warning(f"Failed to communicate with Gemini API ({candidate}): {e}")
        return None


class CloudAIProvider(AIProvider):
    def __init__(self, api_key: str, base_url: Optional[str] = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.model = model

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def chat(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        if not self.api_key:
            return None
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": self.model, "messages": messages, "temperature": 0.2}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    return data["choices"][0]["message"]["content"]
                return None
        except Exception as e:
            logger.warning(f"Cloud AI provider error: {e}")
            return None


class AIProviderOrchestrator:
    """
    AI Provider Orchestrator for FarmSaathi.
    Intelligently coordinates queries between:
      1. Ollama Local (e.g. qwen3:8b)
      2. Gemini API (Cloud AI: gemini-1.5-flash)
      3. Fallback Cloud Provider (OpenAI compatible if configured)
    """

    def __init__(self):
        self.ollama = OllamaProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            timeout=settings.ollama_timeout_seconds,
        )
        self.gemini = GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
            timeout=settings.gemini_timeout_seconds,
        )
        self.cloud = CloudAIProvider(
            api_key=settings.openai_api_key or "",
            base_url=settings.openai_base_url,
            model=settings.openai_model,
        )

    async def generate_reply(self, messages: List[Dict[str, Any]]) -> Optional[str]:
        """
        Orchestration flow:
        - Primary: Ollama Local (qwen3:8b)
        - Secondary / Failover: Gemini API (gemini-1.5-flash)
        - Tertiary: OpenAI fallback if configured
        """
        # 1. Try Ollama Local first if primary is ollama
        if settings.ai_provider == "ollama":
            if await self.ollama.is_available():
                reply = await self.ollama.chat(messages)
                if reply:
                    logger.info("Generated response using Ollama Local AI (%s)", settings.ollama_model)
                    return reply
                logger.warning("Ollama chat attempt failed, routing to Gemini Cloud AI fallback...")
            else:
                logger.info("Ollama Local is currently offline, orchestrating request to Gemini Cloud AI...")

            # 2. Seamlessly route to Gemini API
            if await self.gemini.is_available():
                reply = await self.gemini.chat(messages)
                if reply:
                    logger.info("Generated response using Gemini Cloud AI (%s)", settings.gemini_model)
                    return reply
                logger.warning("Gemini Cloud AI attempt failed.")

            # 3. Tertiary cloud provider if configured
            if settings.openai_api_key:
                logger.info("Routing request to fallback OpenAI provider...")
                return await self.cloud.chat(messages)

            return None

        # If primary provider is configured as gemini
        elif settings.ai_provider == "gemini":
            if await self.gemini.is_available():
                reply = await self.gemini.chat(messages)
                if reply:
                    logger.info("Generated response using Gemini Cloud AI (%s)", settings.gemini_model)
                    return reply
            # Fallback to Ollama Local
            if await self.ollama.is_available():
                logger.info("Gemini unreachable, falling back to Ollama Local (%s)...", settings.ollama_model)
                return await self.ollama.chat(messages)

            return None

        # General cloud provider
        else:
            return await self.cloud.chat(messages)

    async def get_provider_status(self) -> Dict[str, Any]:
        ollama_ok = await self.ollama.is_available()
        gemini_ok = await self.gemini.is_available()
        cloud_ok = await self.cloud.is_available()
        return {
            "orchestrator_status": "operational",
            "primary_provider": settings.ai_provider,
            "ollama_local": {
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model,
                "available": ollama_ok,
            },
            "gemini_cloud": {
                "model": settings.gemini_model,
                "available": gemini_ok,
            },
            "cloud_fallback": {
                "configured": bool(settings.openai_api_key),
                "model": settings.openai_model,
                "available": cloud_ok,
            },
        }


# Global orchestrator instance and backward-compatible aliases
AIService = AIProviderOrchestrator
ai_service = AIProviderOrchestrator()


async def farm_ai_reply(messages: List[Dict[str, Any]]) -> Optional[str]:
    """Compatibility wrapper for routers importing farm_ai_reply."""
    return await ai_service.generate_reply(messages)
