<template>
  <div class="p-6 max-w-sm mx-auto">
    <h2 class="text-xl mb-3">Enter Access Key</h2>
    <input v-model="key" placeholder="e.g. key_aaa111" class="border p-2 w-full" />
    <button @click="enter" class="mt-3 px-4 py-2 border">Enter</button>
    <p v-if="error" class="text-red-600 mt-2">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { verifyKey } from '@/api/authClient';

const key = ref('');
const error = ref('');
const router = useRouter();

async function enter() {
  localStorage.setItem('beta_api_key', key.value.trim());
  try {
    const ok = await verifyKey();
    if (ok) {
      error.value = '';
      window.dispatchEvent(new Event('beta-key-valid'));
      router.push('/');
    } else {
      throw new Error('invalid');
    }
  } catch {
    error.value = 'The key is invalid.';
    localStorage.removeItem('beta_api_key');
  }
}
</script>

<style scoped>
/* Scoped styles */
</style>