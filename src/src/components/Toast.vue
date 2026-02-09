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

// 외부에서 this.$refs.toast.show('...') 느낌으로 쓰기 위한 expose
defineExpose({ show });
</script>

<template>
  <transition name="fade">
    <div v-if="visible" class="fixed bottom-6 right-6 bg-black/80 text-white text-sm px-3 py-2 rounded">
      {{ msg }}
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,.fade-leave-active{ transition: opacity .2s }
.fade-enter-from,.fade-leave-to{ opacity:0 }
</style>
