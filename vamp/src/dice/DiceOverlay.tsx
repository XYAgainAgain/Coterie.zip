import { useRef, useEffect, useState } from 'preact/hooks';
import { diceEngine } from './diceState';
import { performRawRoll } from './rollMove';

interface ButtonPos { x: number; y: number }

const DICE_COUNTS = [1, 2, 3, 4, 5, 6, 10] as const;
type DiceCount = (typeof DICE_COUNTS)[number];
const DBLCLICK_WINDOW = 300;

/* Spinner sits just right of the Vamp wordmark; null falls back to the corner default */
function headerAnchorX(): number | null {
  const title = document.querySelector('.vamp-header__title');
  return title ? title.getBoundingClientRect().right + 28 : null;
}

export function DiceOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

      await engine.initDemo();
      if (disposed) { engine.dispose(); return; }

      diceEngine.value = engine;
      engine.setSpinnerAnchorX(headerAnchorX());
      setBtnPos(engine.getSpinnerScreenPosition());
      /* Sinistre swapping in changes the wordmark width */
      document.fonts?.ready.then(() => {
        if (disposed || !diceEngine.value) return;
        diceEngine.value.setSpinnerAnchorX(headerAnchorX());
        setBtnPos(diceEngine.value.getSpinnerScreenPosition());
      });
    }

    function onResize() {
      if (!canvasRef.current || !diceEngine.value) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      diceEngine.value.handleResize(w, h);
      diceEngine.value.setSpinnerAnchorX(headerAnchorX());
      setBtnPos(diceEngine.value.getSpinnerScreenPosition());
    }

    init();
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      window.removeEventListener('resize', onResize);
      diceEngine.value?.dispose();
      diceEngine.value = null;
    };
  }, []);

  const handleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      performRawRoll(diceCount);
    }, DBLCLICK_WINDOW);
  };

  const handleDoubleClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    diceEngine.value?.clearDice();
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
              width: '24px',
              height: '24px',
              zIndex: 10000,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
              pointerEvents: 'auto',
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: `${btnPos.x + 10}px`,
              top: `${btnPos.y - 10}px`,
              zIndex: 10001,
              pointerEvents: 'none',
              background: 'var(--v-accent-2)',
              /* Flips black/white on the badge's own lightness so any custom accent stays legible */
              color: 'oklch(from var(--v-accent-2) calc((0.66 - l) * infinity) 0 0)',
              borderRadius: '50%',
              width: '14px',
              height: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '8px',
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
