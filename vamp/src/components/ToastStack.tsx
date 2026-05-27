import { toasts, dismissToast } from '../state/toasts';

export function ToastStack() {
  const items = toasts.value;

  return (
    <div class="vamp-toasts">
      {items.map(toast => (
        <div
          key={toast.id}
          class={`vamp-toasts__item ${!toast.bg ? `vamp-toasts__item--${toast.type}` : ''} ${toast.title ? 'vamp-toasts__item--titled' : ''}`}
          style={
            toast.bg
              ? `background: ${toast.bg}; border: 1px solid ${toast.border ?? toast.bg}`
              : undefined
          }
          onClick={() => dismissToast(toast.id)}
        >
          {toast.title && <strong class="vamp-toasts__title">{toast.title}</strong>}
          <span class="vamp-toasts__message">{toast.message}</span>
          <button class="vamp-toasts__dismiss" aria-label="Dismiss">&times;</button>
        </div>
      ))}
    </div>
  );
}
