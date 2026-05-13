import { useRef, useEffect, useState } from 'preact/hooks';

interface ButtonPos { x: number; y: number }

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 10] as const;
type DiceCount = (typeof DICE_COUNTS)[number];
const DBLCLICK_WINDOW = 300;

export function DiceOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<{ dispose: () => void; spawnFromSpinner: (count?: number) => void; clearDice: () => void; getSpinnerScreenPosition: () => ButtonPos | null; handleResize: (w: number, h: number) => void } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [btnPos, setBtnPos] = useState<ButtonPos | null>(null);
  const [diceCount, setDiceCount] = useState<DiceCount>(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    async function init() {
      const { DiceEngine } = await import('./DiceEngine');
      if (disposed) return;

      const engine = new DiceEngine(canvas!);
      await engine.init();
      if (disposed) { engine.dispose(); return; }

      engineRef.current = engine;
      await engine.initDemo();
      if (disposed) { engine.dispose(); return; }

      setBtnPos(engine.getSpinnerScreenPosition());
    }

    function onResize() {
      if (!canvasRef.current || !engineRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      engineRef.current.handleResize(w, h);
      setBtnPos(engineRef.current.getSpinnerScreenPosition());
    }

    init();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      engineRef.current?.spawnFromSpinner(diceCount);
    }, DBLCLICK_WINDOW);
  };

  const handleDoubleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    engineRef.current?.clearDice();
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setDiceCount(prev => {
      const idx = DICE_COUNTS.indexOf(prev);
      return DICE_COUNTS[(idx + 1) % DICE_COUNTS.length];
    });
  };

  const countLabel = diceCount === 10 ? 'M' : String(diceCount);

  return (
    <>
      <canvas
        ref={canvasRef}
        class="dice-overlay"
        width={800}
        height={600}
        style={{
          position: 'fixed',
          inset: '0',
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      />
      {btnPos && (
        <>
          <button
            onClick={handleClick}
            onDblClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            aria-label={`Roll ${diceCount === 10 ? 'many' : diceCount} dice`}
            style={{
              position: 'fixed',
              left: `${btnPos.x}px`,
              top: `${btnPos.y}px`,
              transform: 'translate(-50%, -50%)',
              width: '48px',
              height: '48px',
              zIndex: 10000,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '8px',
              pointerEvents: 'auto',
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: `${btnPos.x + 20}px`,
              top: `${btnPos.y - 20}px`,
              zIndex: 10001,
              pointerEvents: 'none',
              background: '#cc3333',
              color: '#fff',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            {countLabel}
          </div>
        </>
      )}
    </>
  );
}
