import { Application, Container } from "pixi.js";
import { createStation } from "./sim";
import { CELL, drawGrid, drawStation } from "./view/stationView";
import { palette } from "./view/palette";

const station = createStation();

async function start(): Promise<void> {
  const host = document.getElementById("view");
  if (!host) throw new Error("#view element missing");

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: palette.background,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  const scene = new Container();
  app.stage.addChild(scene);

  // Redraw on resize, keeping grid cell (0, 0) centred on screen.
  const layout = (): void => {
    scene.removeChildren().forEach((child) => child.destroy());
    const { width, height } = app.screen;
    const originX = Math.round(width / 2 - CELL / 2);
    const originY = Math.round(height / 2 - CELL / 2);

    scene.addChild(drawGrid(width, height, originX, originY));
    const stationLayer = drawStation(station);
    stationLayer.position.set(originX, originY);
    scene.addChild(stationLayer);
  };

  layout();
  app.renderer.on("resize", layout);
}

start().catch((error: unknown) => {
  console.error(error);
  const status = document.getElementById("status");
  if (status) status.textContent = "Could not start the renderer.";
});
