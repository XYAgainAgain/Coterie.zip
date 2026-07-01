import { useSignal, useSignalEffect } from '@preact/signals';
import { useRef, useEffect, useCallback } from 'preact/hooks';
import { debounce } from '../utils/debounce';

const DEBOUNCE_MS = 3000;

interface EditableTextFieldProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoResize?: boolean;
  className?: string;
  label?: string;
  hideLabel?: boolean;
  inputFilter?: (value: string) => string;
}

export function EditableTextField({
  value,
  onSave,
  placeholder,
  multiline,
  autoResize,
  className,
  label,
  hideLabel,
  inputFilter,
}: EditableTextFieldProps) {
  const editing = useSignal(false);
  const draft = useSignal(value || '');
  const savedRef = useRef(value || '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const debouncedSave = useRef(
    debounce((text: string) => {
      savedRef.current = text;
      onSaveRef.current(text);
    }, DEBOUNCE_MS)
  ).current;

  useEffect(() => () => debouncedSave.cancel(), []);

  useSignalEffect(() => {
    if (!editing.value) {
      draft.value = value || '';
      savedRef.current = value || '';
    }
  });

  useSignalEffect(() => {
    if (editing.value && inputRef.current) {
      inputRef.current.focus();
      if (autoResize && inputRef.current instanceof HTMLTextAreaElement) {
        resizeTextarea(inputRef.current);
      }
    }
  });

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  function handleInput(e: Event) {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    let text = el.value;
    if (inputFilter) {
      text = inputFilter(text);
      el.value = text;
    }
    draft.value = text;
    if (autoResize && el instanceof HTMLTextAreaElement) resizeTextarea(el);
    debouncedSave(text);
  }

  function handleBlur() {
    debouncedSave.flush();
    editing.value = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      debouncedSave.cancel();
      draft.value = savedRef.current;
      editing.value = false;
      return;
    }
    if (e.key === 'Enter' && !multiline) {
      debouncedSave.flush();
      editing.value = false;
    }
  }

  function startEdit() {
    draft.value = value || '';
    savedRef.current = value || '';
    editing.value = true;
  }

  const displayValue = value || '';
  const isEmpty = !displayValue.trim();
  const Tag = multiline ? 'textarea' : 'input';
  const fieldClass = `vamp-editable ${className ?? ''}`;

  if (editing.value) {
    return (
      <div class={fieldClass}>
        {label && !hideLabel && <label class="vamp-editable__label">{label}</label>}
        <Tag
          ref={(el: HTMLInputElement | HTMLTextAreaElement | null) => { inputRef.current = el; }}
          class="vamp-editable__input"
          value={draft.value}
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || (label ? `Add ${label.toLowerCase()}...` : '')}
          {...(multiline ? { rows: 3 } : {})}
        />
      </div>
    );
  }

  return (
    <div
      class={fieldClass}
      onDblClick={startEdit}
      role="button"
      tabIndex={0}
      aria-label={label ? `${label}: double-click to edit` : 'Double-click to edit'}
      onKeyDown={(e) => { if (e.key === 'Enter') startEdit(); }}
    >
      {label && !hideLabel && <label class="vamp-editable__label">{label}</label>}
      {isEmpty ? (
        <span class="vamp-editable__placeholder">
          {placeholder || (label ? `Double-click to add ${label.toLowerCase()}...` : 'Double-click to edit...')}
        </span>
      ) : (
        /* User-typed content renders as plain text on purpose: if this field ever needs
           markdown, it must go through renderUserMarkdown, never renderGameMarkdown. */
        <span class="vamp-editable__display">{displayValue}</span>
      )}
    </div>
  );
}
