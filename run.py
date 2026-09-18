import logging

from app.config import LOG_LEVEL
from app.server import main

if __name__ == "__main__":
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    main()
