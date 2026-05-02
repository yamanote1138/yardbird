import { ref } from 'vue'

const editMode = ref(false)

export function useEditMode() {
  function toggle() {
    editMode.value = !editMode.value
  }

  function exit() {
    editMode.value = false
  }

  return { editMode, toggle, exit }
}
