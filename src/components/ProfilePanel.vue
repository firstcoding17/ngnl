<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps<{ rows: any[] }>();
const worker = new Worker(new URL('../workers/profile.worker.js', import.meta.url), { type:'module' });

const state = ref<any>(null);
const loading = ref(false);

function run(){
  if (!props.rows?.length) return;
  loading.value = true;
  worker.postMessage({ rows: props.rows, sampleSize: 1000, numericHint: [] });
}
onMounted(()=> {
  worker.onmessage = (e) => { state.value = e.data.data; loading.value = false; };
  run();
});
onBeforeUnmount(()=> worker.terminate());
watch(() => props.rows, run);

function pct(x){ return (x??0).toFixed(2)+'%'; }
</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold">프로필</h3>
      <span v-if="loading" class="text-xs text-gray-500">샘플 분석 중...</span>
      <span v-else-if="state" class="text-xs text-gray-500">샘플 {{ state.sampleCount }}행 기반</span>
    </div>

    <div v-if="state" class="grid md:grid-cols-3 gap-3 text-sm">
        <div v-if="state?.warnings?.length" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
          <div v-for="(w,i) in state.warnings" :key="i">⚠️ {{ w }}</div>
           </div>
      <div class="p-2 border rounded">
        <div class="font-medium mb-1">컬럼 요약</div>
        <div class="max-h-60 overflow-auto">
          <table class="w-full">
            <thead><tr><th class="text-left">컬럼</th><th>타입</th><th>null</th><th>unique</th></tr></thead>
            <tbody>
              <tr v-for="(p,c) in state.profile" :key="c">
                <td class="pr-2">{{ c }}</td>
                <td class="text-center">{{ p.type }}</td>
                <td class="text-center">{{ p.nullPct }}%</td>
                <td class="text-center">{{ p.unique }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="p-2 border rounded">
        <div class="font-medium mb-1">중복 행 (샘플)</div>
        <div class="text-2xl">{{ state.duplicates }}</div>
        <div class="text-xs text-gray-500">중복 키 기준(샘플 내)</div>
      </div>

      <div class="p-2 border rounded">
        <div class="font-medium mb-1">상관 TOP10 (숫자)</div>
        <div class="max-h-60 overflow-auto">
          <ul>
            <li v-for="p in state.topCorr" :key="p.x+'-'+p.y">
              {{ p.x }} — {{ p.y }} : <b>{{ p.r }}</b>
            </li>
          </ul>
        </div>
      </div>

      <div class="p-2 border rounded md:col-span-3">
        <div class="font-medium mb-1">ANOVA TOP10 (범주 → 숫자)</div>
        <div class="max-h-60 overflow-auto">
          <table class="w-full">
            <thead><tr><th>범주</th><th>숫자</th><th>F</th><th>p</th></tr></thead>
            <tbody>
              <tr v-for="a in state.topAnova" :key="a.cat+'-'+a.y">
                <td>{{ a.cat }}</td><td>{{ a.y }}</td><td>{{ a.F }}</td><td>{{ a.p }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="text-xs text-gray-500 mt-1">
          * 샘플 기반의 탐색용 지표입니다(정식 검정은 전체 데이터/가정 확인 필요).
        </div>
      </div>
    </div>
  </div>
</template>
