from channels.middleware import BaseMiddleware

class CustomMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        # Bypass session handling
        return await self.inner(scope, receive, send)