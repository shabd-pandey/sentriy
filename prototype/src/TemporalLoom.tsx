import { useCallback, useEffect, useRef, useState } from "react";

type TemporalLoomProps = {
  completedPlays: number;
  requiredPlays: number;
  demoMode?: boolean;
  onComplete: () => void;
  onClaim: () => void;
  onClose: () => void;
};

type GameState = "intro" | "playing" | "finished" | "claimed";

type Thread = {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  seed: number;
  attached: boolean;
  dragging: boolean;
  hue: number;
};

const GAME_SECONDS = 30;
const TARGET_RADIUS = 96;

function formatScore(value: number) {
  return value.toString().padStart(6, "0");
}

export default function TemporalLoom({ completedPlays, requiredPlays, onComplete, onClaim, onClose }: TemporalLoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const threadsRef = useRef<Thread[]>([]);
  const activeThreadRef = useRef<number | null>(null);
  const stateRef = useRef<GameState>("intro");
  const lastSpawnRef = useRef(0);
  const nextIdRef = useRef(1);
  const scoreRef = useRef(0);
  const [gameState, setGameState] = useState<GameState>("intro");
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [score, setScore] = useState(0);
  const [secured, setSecured] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const attemptsRef = useRef(0);
  const completionSentRef = useRef(false);

  const updateState = useCallback((nextState: GameState) => {
    stateRef.current = nextState;
    setGameState(nextState);
  }, []);

  const spawnThread = useCallback((width: number, height: number) => {
    const edge = Math.floor(Math.random() * 4);
    const margin = 18;
    let startX = 0;
    let startY = 0;

    if (edge === 0) {
      startX = Math.random() * width;
      startY = -margin;
    } else if (edge === 1) {
      startX = width + margin;
      startY = Math.random() * height;
    } else if (edge === 2) {
      startX = Math.random() * width;
      startY = height + margin;
    } else {
      startX = -margin;
      startY = Math.random() * height;
    }

    const centerX = width * 0.5;
    const centerY = height * 0.58;
    const reach = 0.18 + Math.random() * 0.2;

    threadsRef.current.push({
      id: nextIdRef.current++,
      startX,
      startY,
      endX: startX + (centerX - startX) * reach,
      endY: startY + (centerY - startY) * reach,
      seed: Math.random() * Math.PI * 2,
      attached: false,
      dragging: false,
      hue: 108 + Math.random() * 38,
    });
  }, []);

  const startGame = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    threadsRef.current = [];
    nextIdRef.current = 1;
    attemptsRef.current = 0;
    scoreRef.current = 0;
    setScore(0);
    setSecured(0);
    setAccuracy(100);
    setTimeLeft(GAME_SECONDS);
    completionSentRef.current = false;
    lastSpawnRef.current = performance.now();
    updateState("playing");

    for (let i = 0; i < 5; i += 1) {
      spawnThread(stage.clientWidth, stage.clientHeight);
    }
  }, [spawnThread, updateState]);

  useEffect(() => {
    if (gameState !== "playing") return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== "playing" || timeLeft !== 0 || completionSentRef.current) return;
    completionSentRef.current = true;
    onComplete();
    updateState("finished");
  }, [gameState, onComplete, timeLeft, updateState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = stage.clientWidth * ratio;
      canvas.height = stage.clientHeight * ratio;
      canvas.style.width = `${stage.clientWidth}px`;
      canvas.style.height = `${stage.clientHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const centerX = width * 0.5;
      const centerY = height * 0.58;
      context.clearRect(0, 0, width, height);

      if (stateRef.current === "playing" && now - lastSpawnRef.current > 1250) {
        const amount = Math.random() > 0.45 ? 2 : 1;
        for (let i = 0; i < amount; i += 1) spawnThread(width, height);
        lastSpawnRef.current = now;
        if (threadsRef.current.length > 42) {
          const removable = threadsRef.current.findIndex((thread) => !thread.attached);
          if (removable >= 0) threadsRef.current.splice(removable, 1);
        }
      }

      threadsRef.current.forEach((thread) => {
        if (!thread.dragging && !thread.attached) {
          thread.endX += Math.sin(now * 0.0016 + thread.seed) * 0.3;
          thread.endY += Math.cos(now * 0.0013 + thread.seed) * 0.3;
        }

        const destinationX = thread.attached ? centerX : thread.endX;
        const destinationY = thread.attached ? centerY : thread.endY;
        const dx = destinationX - thread.startX;
        const dy = destinationY - thread.startY;
        const normalX = -dy;
        const normalY = dx;
        const length = Math.max(Math.hypot(dx, dy), 1);
        const wave = Math.sin(now * 0.002 + thread.seed) * (thread.attached ? 18 : 34);
        const controlX = thread.startX + dx * 0.52 + (normalX / length) * wave;
        const controlY = thread.startY + dy * 0.52 + (normalY / length) * wave;

        context.save();
        context.beginPath();
        context.moveTo(thread.startX, thread.startY);
        context.quadraticCurveTo(controlX, controlY, destinationX, destinationY);
        context.strokeStyle = `hsla(${thread.hue}, 90%, ${thread.attached ? 66 : 48}%, ${thread.attached ? 0.95 : 0.68})`;
        context.lineWidth = thread.attached ? 2.4 : 1.6;
        context.shadowColor = `hsla(${thread.hue}, 100%, 60%, 1)`;
        context.shadowBlur = stateRef.current === "finished" ? 24 : thread.attached ? 11 : 4;
        context.stroke();

        context.beginPath();
        context.arc(destinationX, destinationY, thread.dragging ? 10 : 7, 0, Math.PI * 2);
        context.fillStyle = thread.attached ? "rgba(168, 255, 126, .88)" : "rgba(116, 255, 107, .72)";
        context.shadowBlur = 18;
        context.fill();
        context.restore();
      });

      if (stateRef.current === "playing") {
        const pulse = 1 + Math.sin(now * 0.004) * 0.08;
        context.save();
        context.beginPath();
        context.arc(centerX, centerY, 62 * pulse, 0, Math.PI * 2);
        context.strokeStyle = "rgba(157, 255, 117, .38)";
        context.setLineDash([4, 9]);
        context.lineWidth = 1.5;
        context.shadowColor = "#8dff65";
        context.shadowBlur = 16;
        context.stroke();
        context.restore();
      }

      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [spawnThread]);

  const getPointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (stateRef.current !== "playing") return;
    const point = getPointerPosition(event);
    let nearest: Thread | undefined;
    let nearestDistance = 32;

    threadsRef.current.forEach((thread) => {
      if (thread.attached) return;
      const distance = Math.hypot(thread.endX - point.x, thread.endY - point.y);
      if (distance < nearestDistance) {
        nearest = thread;
        nearestDistance = distance;
      }
    });

    if (nearest) {
      nearest.dragging = true;
      activeThreadRef.current = nearest.id;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeThreadRef.current === null) return;
    const point = getPointerPosition(event);
    const active = threadsRef.current.find((thread) => thread.id === activeThreadRef.current);
    if (active) {
      active.endX = point.x;
      active.endY = point.y;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeThreadRef.current === null || !stageRef.current) return;
    const active = threadsRef.current.find((thread) => thread.id === activeThreadRef.current);
    if (!active) return;

    const centerX = stageRef.current.clientWidth * 0.5;
    const centerY = stageRef.current.clientHeight * 0.58;
    const distance = Math.hypot(active.endX - centerX, active.endY - centerY);
    attemptsRef.current += 1;
    active.dragging = false;

    if (distance <= TARGET_RADIUS) {
      active.attached = true;
      const precision = Math.max(0, 1 - distance / TARGET_RADIUS);
      const gained = Math.round(250 + precision * 750);
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setSecured((current) => current + 1);
    }

    const attachedCount = threadsRef.current.filter((thread) => thread.attached).length;
    setAccuracy(Math.round((attachedCount / attemptsRef.current) * 100));
    activeThreadRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <main className="game-shell" role="dialog" aria-modal="true" aria-label="Temporal Loom rewards game">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="topbar">
        <div className="sigil" aria-hidden="true">T</div>
        <div className="brand">
          <span>TVA ARCHIVE // 7A</span>
          <strong>Temporal Loom</strong>
        </div>
        <div className="status"><i /> SYSTEM STABLE</div>
      </header>

      <section className="game-stage" ref={stageRef}>
        <div className="backdrop" />
        <div className="vignette" />
        <canvas
          ref={canvasRef}
          className="thread-canvas"
          aria-label="Temporal thread game area"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        <div className="hud">
          <div className="hud-block">
            <span>TIME REMAINING</span>
            <strong>{gameState === "intro" ? "00:30" : `00:${timeLeft.toString().padStart(2, "0")}`}</strong>
          </div>
          <div className="hud-block hud-score">
            <span>NEXUS SCORE</span>
            <strong>{formatScore(score)}</strong>
          </div>
        </div>

        {gameState === "playing" && (
          <>
            <div className="instruction">
              <span>DRAG THE GLOWING ENDS</span>
              Anchor each timeline to the nexus
            </div>
            <div className="metrics">
              <div><span>SECURED</span><strong>{secured.toString().padStart(2, "0")}</strong></div>
              <div><span>ACCURACY</span><strong>{accuracy}%</strong></div>
            </div>
          </>
        )}

        {gameState === "intro" && (
          <div className="panel intro-panel">
            <p className="eyebrow">VARIANT PROTOCOL 616</p>
            <h1>BIND THE<br /><em>TIMELINES</em></h1>
            <p className="panel-copy">
              Fractured timelines are breaching the void. Seize each temporal thread and bind it to the keeper before the loom collapses.
            </p>
            <button type="button" className="primary-action" onClick={startGame}>
              ENTER THE LOOM <span>→</span>
            </button>
            <p className="microcopy">30 SECOND PROTOCOL · PRECISION INCREASES SCORE</p>
          </div>
        )}

        {(gameState === "finished" || gameState === "claimed") && (
          <div className="panel result-panel">
            <div className="result-sigil">◈</div>
            <p className="eyebrow">TEMPORAL EVENT COMPLETE</p>
            <h2>INCURSION IS<br /><em>INEVITABLE</em></h2>
            <div className="final-score">
              <span>FINAL NEXUS SCORE</span>
              <strong>{formatScore(score)}</strong>
            </div>
            <div className="result-stats">
              <div><strong>{secured}</strong><span>THREADS HELD</span></div>
              <div><strong>{accuracy}%</strong><span>ACCURACY</span></div>
            </div>
            {gameState === "finished" ? (
              <button type="button" className="primary-action" onClick={() => {
                if (completedPlays + 1 >= requiredPlays) onClaim();
                else onClose();
              }}>
                {completedPlays + 1 >= requiredPlays ? "CLAIM YOUR REWARD" : "SAVE ROUND"} <span>→</span>
              </button>
            ) : (
              <div className="reward">
                <span>REWARD UNLOCKED</span>
                <strong>KEEPER OF THE LOOM</strong>
                <button type="button" className="replay" onClick={onClose}>RETURN TO TICKETS</button>
              </div>
            )}
          </div>
        )}

        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
      </section>

      <footer>
        <span>THE SACRED TIMELINE // CLASSIFIED</span>
        <span>© TVA TEMPORAL AUTHORITY</span>
      </footer>
    </main>
  );
}
