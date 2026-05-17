import { useSignal, useSignalEffect } from '@preact/signals';
import { useRef } from 'preact/hooks';

export function EditableText({ value, onSave, placeholder, multiline, className }: {
  value: string;
  onSave: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}) {
  const editing = useSignal(false);
  const draft = useSignal(value);
  const savedRef = useRef(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useSignalEffect(() => {
    if (!editing.value) draft.value = value;
  });

  function startEdit() {
    draft.value = value;
    savedRef.current = value;
    editing.value = true;
  }

  function commit() {
    const trimmed = draft.value.trim();
    if (trimmed !== savedRef.current) {
      onSave(trimmed);
      savedRef.current = trimmed;
    }
    editing.value = false;
  }

  function cancel() {
    draft.value = savedRef.current;
    editing.value = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter' && !multiline) commit();
  }

  if (editing.value) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <Tag
        ref={(el: HTMLInputElement | HTMLTextAreaElement | null) => {
          inputRef.current = el;
          el?.focus();
        }}
        class={`vamp-editable__input ${className ?? ''}`}
        value={draft.value}
        onInput={(e) => { draft.value = (e.target as HTMLInputElement).value; }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      class={`vamp-editable ${className ?? ''}`}
      onDblClick={startEdit}
      title="Double-click to edit"
    >
      {value || <span class="vamp-editable__placeholder">{placeholder ?? 'Empty'}</span>}
    </span>
  );
}
