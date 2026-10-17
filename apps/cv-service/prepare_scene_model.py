import argparse
from pathlib import Path
import subprocess
import sys

from scene_analysis import load_scene_model, scene_model_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare optional scene analysis without replacing OpenCV or CPU torch.")
    parser.add_argument("--install", action="store_true", help="Install the optional runtime first")
    args = parser.parse_args()
    if args.install:
        directory = Path(__file__).resolve().parent
        subprocess.run([sys.executable, "-m", "ensurepip", "--upgrade"], check=True)
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-c", str(directory / "requirements-cpu.txt"),
            "-r", str(directory / "requirements-scene.txt"),
        ], check=True)
        # Use the existing headless OpenCV instead of installing a second cv2 package.
        subprocess.run([
            sys.executable, "-m", "pip", "install", "--no-deps", "ultralytics==8.4.158",
        ], check=True)
    print("Preparing the experimental YOLOE model (AGPL-3.0).")
    model = load_scene_model(allow_download=True)
    print(f"Model ready: {scene_model_path()}")
    print(f"Vocabulary: {len(model.names)} categories")
