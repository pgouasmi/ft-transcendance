from CLIClient import CLIClient
import asyncio
import subprocess


# Désactiver souris sur le terminal
subprocess.run(['printf', '\033[?1003l'])
subprocess.run(['printf', '\033[?1002l'])
subprocess.run(['printf', '\033[?1001l'])
subprocess.run(['printf', '\033[?1000l'])


if __name__ == "__main__":
    client = CLIClient()
    try:
        asyncio.run(client.run())
    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"Fatal error: {e}")
    finally:
        if hasattr(client, 'cleanup_curses'):
            client.cleanup_curses()

# if __name__ == "__main__":
#     client = CLIClient()
#     asyncio.run(client.run())