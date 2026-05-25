import { signal } from '@preact/signals';

export const editMode = signal(false);
export const disciplineBuyMode = signal(false);
/* Set when viewing another player's sheet via Coterie link */
export const viewingOtherSheet = signal(false);

export function toggleEditMode() {
  editMode.value = !editMode.value;
  document.documentElement.setAttribute('data-edit-mode', String(editMode.value));
}

export function enterDisciplineBuyMode() {
  disciplineBuyMode.value = true;
}

export function exitDisciplineBuyMode() {
  disciplineBuyMode.value = false;
}
