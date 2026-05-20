import { signal } from '@preact/signals';

export const editMode = signal(false);

export function toggleEditMode() {
  editMode.value = !editMode.value;
  document.documentElement.setAttribute('data-edit-mode', String(editMode.value));
}
