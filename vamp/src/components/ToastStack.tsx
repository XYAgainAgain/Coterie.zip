import { toasts, dismissToast } from '../state/toasts';

export function ToastStack() {
  const items = toasts.value;

  return (
    <div class="vamp-toasts">
      {items.map(toast => (
        <div
          key={toast.id}
          class={`vamp-toasts__item ${toast.hue == null ? `vamp-toasts__item--${toast.type}` : ''}`}
          style={
            toast.hue != null
              ? `background: hsl(${toast.hue} 40% 15%); border: 1px solid hsl(${toast.hue} 70% 50%)`
              : undefined
          }
          onClick={() => dismissToast(toast.id)}
        >
          <span class="vamp-toasts__message">{toast.message}</span>
          <button class="vamp-toasts__dismiss" aria-label="Dismiss">&times;</button>
        </div>
      ))}
    </div>
  );
}
