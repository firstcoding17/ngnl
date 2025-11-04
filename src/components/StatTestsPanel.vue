<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
const props = defineProps<{ rows:any[], columns:string[] }>();
const worker = new Worker(new URL('../workers/tests.worker.js', import.meta.url), { type:'module' });

const numCols = computed(()=> props.columns.filter(c => props.rows.some(r => Number.isFinite(Number(r[c])))));
const catCols = computed(()=> props.columns.filter(c => !numCols.value.includes(c)));

const result = ref<any>(null);
const loading = ref(false);
worker.onmessage = (e) => { result.value = e.data; loading.value=false; };

function run(kind, payload){ loading.value=true; worker.postMessage({ kind, payload:{ rows:props.rows, ...payload } }); }

const t = ref({ mode:'independent', colA:'', colB:'', oneCol:'', mu:0, alternative:'two-sided' });
const norm = ref({ column:'' });
const lev = ref({ column:'', group:'' });
</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <h3 class="font-semibold">정식 통계 검정</h3>

    <!-- t-test -->
    <details open class="p-2 border rounded">
      <summary class="font-medium">t-검정</summary>
      <div class="flex flex-wrap gap-2 items-center mt-2">
        <select v-model="t.mode">
          <option value="independent">독립(웨엘치)</option>
          <option value="paired">대응</option>
          <option value="one-sample">단일표본</option>
        </select>
        <template v-if="t.mode==='independent' || t.mode==='paired'">
          <select v-model="t.colA"><option value="">A 컬럼</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
          <select v-model="t.colB"><option value="">B 컬럼</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        </template>
        <template v-else>
          <select v-model="t.oneCol"><option value="">표본 컬럼</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
          μ=<input type="number" v-model.number="t.mu" class="w-24" />
        </template>
        <select v-model="t.alternative">
          <option value="two-sided">양측</option>
          <option value="greater">A&gt;B / 표본&gt;μ</option>
          <option value="less">A&lt;B / 표본&lt;μ</option>
        </select>
        <button @click="run('ttest', t)">실행</button>
      </div>
    </details>

    <!-- Normality -->
    <details class="p-2 border rounded">
      <summary class="font-medium">정규성 (Jarque–Bera)</summary>
      <div class="flex gap-2 items-center mt-2">
        <select v-model="norm.column"><option value="">컬럼</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        <button @click="run('normality', norm)">실행</button>
      </div>
    </details>

    <!-- Homogeneity -->
    <details class="p-2 border rounded">
      <summary class="font-medium">등분산 (Levene: Brown-Forsythe)</summary>
      <div class="flex gap-2 items-center mt-2">
        <select v-model="lev.column"><option value="">숫자 컬럼</option><option v-for="c in numCols" :key="c">{{ c }}</option></select>
        <select v-model="lev.group"><option value="">그룹 컬럼(범주)</option><option v-for="c in catCols" :key="c">{{ c }}</option></select>
        <button @click="run('levene', lev)">실행</button>
      </div>
    </details>

    <!-- 결과 -->
    <div v-if="loading" class="text-sm text-gray-500">계산 중…</div>
    <div v-else-if="result?.ok && result?.data" class="text-sm">
      <pre class="bg-gray-50 p-2 rounded">{{ JSON.stringify(result.data, null, 2) }}</pre>
      <div class="text-xs text-gray-600">
        * 탐색/의사결정 보조 용도입니다. 전제 위반/다중검정 보정 등은 사용자가 확인해야 합니다.
      </div>
    </div>
    <div v-else-if="result && !result.ok" class="text-sm text-red-600">오류: {{ result.error }}</div>
  </div>
</template>
