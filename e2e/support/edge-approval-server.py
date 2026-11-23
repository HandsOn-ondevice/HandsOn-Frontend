"""Start a disposable Edge simulation with the demo's fixed generator result."""

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-dir", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8053)
    parser.add_argument("--web-origin", default="http://localhost:8153")
    args = parser.parse_args()
    backend_dir = args.backend_dir.resolve()
    if not (backend_dir / "app" / "main.py").is_file():
        parser.error("--backend-dir must point to a HandsOn-Backend checkout")
    sys.path.insert(0, str(backend_dir))

    import uvicorn

    from app import main as edge_main, service as edge_service
    from app.config import Settings

    fixture_path = Path(__file__).resolve().parents[1] / "fixtures" / "edge-approval.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    class FixedDraftDatabase(edge_service.Database):
        def put(self, db, kind, identifier, data):
            # Edge builds its simulation template inside draft_create and has no
            # generator hook. Substitute that result before the real transaction
            # saves the draft and its idempotent response.
            if (
                kind == "draft"
                and data["revision"] == 0
                and data["generator"] == "simulation-template-v1"
                and data["title"] == fixture["title"]
                and data["confirmedText"] == fixture["transcript"]
            ):
                data.update(steps=deepcopy(fixture["steps"]), generator=fixture["generator"])
            super().put(db, kind, identifier, data)

    with TemporaryDirectory(prefix="handson-edge-approval-") as state_dir:
        settings = Settings(data_dir=Path(state_dir), cors_origins=(args.web_origin,))
        with patch.object(edge_service, "Database", FixedDraftDatabase):
            uvicorn.run(edge_main.create_app(settings), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
