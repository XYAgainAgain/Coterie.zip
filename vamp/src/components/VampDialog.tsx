import { useRef, useEffect } from 'preact/hooks';
import { activeDialog, closeDialog } from '../state/dialog';

/* Singleton themed modal driven by activeDialog, mounted once near the app root.
   Replaces the native browser dialogs that trip the "block this page" prompt on repeat use. */
export function VampDialog() {
  const req = activeDialog.value;
  const dlgRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg || !req) return;
    if (!dlg.open) dlg.showModal();
    if (req.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      dlg.focus();
    }
  }, [req]);

  if (!req) return null;

  const isPrompt = req.kind === 'prompt';
  const confirmLabel = req.opts.confirmLabel ?? (isPrompt ? 'Confirm' : 'Yes');
  const cancelLabel = req.opts.cancelLabel ?? (isPrompt ? 'Cancel' : 'No');

  const confirm = () => closeDialog(isPrompt ? (inputRef.current?.value ?? '') : true);
  const cancel = () => closeDialog(isPrompt ? null : false);

  return (
    <dialog
      ref={dlgRef}
      class="vamp-dialog"
      tabIndex={-1}
      onCancel={e => { e.preventDefault(); cancel(); }}
      onClick={e => { if (e.target === dlgRef.current) cancel(); }}
      onKeyDown={e => {
        if (isPrompt) return;
        const key = e.key.toLowerCase();
        if (key === 'y') { e.preventDefault(); confirm(); }
        else if (key === 'n') { e.preventDefault(); cancel(); }
      }}
    >
      <div class="vamp-dialog__panel">
        {req.opts.title && <h2 class="vamp-dialog__title">{req.opts.title}</h2>}
        <p class="vamp-dialog__message">{req.message}</p>
        {isPrompt && (
          <input
            ref={inputRef}
            class="vamp-dialog__input"
            type="text"
            defaultValue={req.opts.initial ?? ''}
            placeholder={req.opts.placeholder ?? ''}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
          />
        )}
        <div class="vamp-dialog__actions">
          <button class="vamp-dialog__btn vamp-dialog__btn--cancel" type="button" onClick={cancel}>
            {cancelLabel}
          </button>
          <button
            class="vamp-dialog__btn vamp-dialog__btn--confirm"
            type="button"
            onClick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
