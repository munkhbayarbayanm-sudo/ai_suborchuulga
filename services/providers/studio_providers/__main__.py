import sys

import uvicorn

from .app import Settings, create_app


def main():
    try:
        app = create_app(Settings.from_env())
    except (ValueError, KeyError):
        print(
            "Provider startup refused: configure token and absolute storage/work roots.",
            file=sys.stderr,
        )
        return 1
    uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False, log_level="warning", workers=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
