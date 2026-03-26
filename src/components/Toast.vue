<script setup>
import { ref } from 'vue';
const visible = ref(false);
const msg = ref('');
let timer;

function show(text, ms = 2000) {
  msg.value = text;
  visible.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (visible.value = false), ms);
}

// Expose show() so parent components can trigger toasts via template refs.
defineExpose({ show });
</script>

<template>
  <transition name="fade">
    <div v-if="visible" class="toast-pop">
      {{ msg }}
    </div>
  </transition>
</template>

<style scoped>
.toast-pop {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2200;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.22);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
