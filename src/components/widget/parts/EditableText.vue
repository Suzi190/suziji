<script setup>
/**
 * 可直接编辑的文字（点一下进入编辑，失焦 / 回车保存）
 * 组件本身只负责交互与最基础的排版，字体颜色由父级继承
 */
import { nextTick, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '点击编辑' },
  align: { type: String, default: 'left' },
})

const emit = defineEmits(['update:modelValue'])

const editing = ref(false)
const draft = ref('')
const inputEl = ref(null)

async function start() {
  if (editing.value) return
  draft.value = props.modelValue ?? ''
  editing.value = true
  await nextTick()
  const el = inputEl.value
  el?.focus()
  el?.setSelectionRange?.(draft.value.length, draft.value.length)
}

function commit() {
  if (!editing.value) return
  editing.value = false
  emit('update:modelValue', draft.value.trim())
}
</script>

<template>
  <div
    class="editable-text"
    :class="{ editing }"
    :style="{ textAlign: align }"
    @pointerdown.stop
    @click.stop="start"
  >
    <span v-if="!editing" class="text" :class="{ empty: !modelValue }">
      {{ modelValue || placeholder }}
    </span>
    <input
      v-else
      ref="inputEl"
      v-model="draft"
      class="input"
      :placeholder="placeholder"
      :style="{ textAlign: align }"
      @blur="commit"
      @keydown.enter.prevent="commit"
      @keydown.esc="commit"
    />
  </div>
</template>

<style scoped>
.editable-text {
  width: 100%;
  cursor: text;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
}

.text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text.empty {
  color: rgba(124, 101, 112, 0.32);
  font-style: normal;
}

.input {
  width: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
}
</style>
