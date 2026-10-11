"""Run with: python -m planner   (HOST / PORT / PLANNER_DB from the environment)."""

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "planner.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD") == "1",
    )


if __name__ == "__main__":
    main()
