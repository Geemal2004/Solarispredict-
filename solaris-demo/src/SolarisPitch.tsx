import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { CloseScene } from "./scenes/CloseScene";
import { GapScene } from "./scenes/GapScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { TitleScene } from "./scenes/TitleScene";
import { scenes } from "./theme";

export const SolarisPitch: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Sequence
        from={scenes.title.from}
        durationInFrames={scenes.title.duration}
      >
        <TitleScene />
      </Sequence>
      <Sequence
        from={scenes.problem.from}
        durationInFrames={scenes.problem.duration}
      >
        <ProblemScene />
      </Sequence>
      <Sequence from={scenes.gap.from} durationInFrames={scenes.gap.duration}>
        <GapScene />
      </Sequence>
      <Sequence
        from={scenes.solution.from}
        durationInFrames={scenes.solution.duration}
      >
        <SolutionScene />
      </Sequence>
      <Sequence from={scenes.close.from} durationInFrames={scenes.close.duration}>
        <CloseScene />
      </Sequence>
    </AbsoluteFill>
  );
};
