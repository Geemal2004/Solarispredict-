import React from "react";
import { Composition } from "remotion";
import { SolarisPitch } from "./SolarisPitch";
import { FPS, TOTAL_FRAMES } from "./theme";
import "./index.css";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SolarisPitch"
      component={SolarisPitch}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1280}
      height={720}
    />
  );
};
