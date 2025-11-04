<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{ rows:any[], columns:string[] }>();
const emit = defineEmits<{ (e:'apply', payload:{ rows:any[], columns:string[] }):void }>();

const worker = new Worker(new URL('../workers/transform.worker.js', import.meta.url), { type:'module' });

const recipe = ref<any>({
  select: [],
  rename: {},
  trim: [],
  typeCast: {},
  fillna: {},
  dropna: [],
  filter: [],
  cap: {},
  derive: [],
  onehot: [],
  scale: { standardize: [] }
});
const history = ref<any[]>([]);
const future = ref<any[]>([]);
const log = ref('');

function append(s:string){ log.value += s+'\n'; }

onMounted(()=> worker.onmessage = (e:MessageEvent<any>) => {
  const { ok, type, data, error } = e.data;
  if (!ok) return append('❌ '+error);
  if (type==='APPLY'){
    pushHistory(props.rows); // undo 스택에 이전 상태 보관
    future.value = [];       // redo 비움
    emit('apply', data);     // { rows, columns }
    append('✅ 레시피 적용 완료');
  }
});

onBeforeUnmount(()=> worker.terminate());

function runApply(){
  worker.postMessage({ type:'APPLY', payload:{ rows: props.rows, recipe: recipe.value }});
}
function exportCsv(){
  worker.postMessage({ type:'EXPORT_CSV', payload:{ rows: props.rows }});
}
function pushHistory(rows:any[]){ history.value.push(rows.slice(0, 2000)); } // 메모리 보호
function undo(){
  if (!history.value.length) return;
  const prev = history.value.pop()!;
  future.value.push(structuredClone(props.rows));
  emit('apply', { rows: prev, columns: Object.keys(prev[0]||{}) });
}
function redo(){
  if (!future.value.length) return;
  const next = future.value.pop()!;
  history.value.push(structuredClone(props.rows));
  emit('apply', { rows: next, columns: Object.keys(next[0]||{}) });
}
</script>

<template>
  <div class="p-3 border rounded space-y-3">
    <div class="flex items-center gap-2">
      <h3 class="font-semibold">레시피 기반 수정</h3>
      <button @click="undo" :disabled="!history.length">↶ Undo</button>
      <button @click="redo" :disabled="!future.length">↷ Redo</button>
      <button @click="runApply" :disabled="!props.rows.length">레시피 적용</button>
      <button @click="exportCsv" :disabled="!props.rows.length">CSV 다운로드</button>
    </div>

    <details class="p-2 border rounded" open>
      <summary class="font-medium">레시피 편집</summary>

      <div class="grid md:grid-cols-2 gap-4 mt-3">
        <div>
          <label class="block text-sm">select</label>
          <select multiple class="w-full" v-model="recipe.select">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">trim</label>
          <select multiple class="w-full" v-model="recipe.trim">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">typeCast</label>
          <div v-for="c in props.columns" :key="'tc-'+c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <select v-model="recipe.typeCast[c]" class="flex-1">
              <option value="">(none)</option>
              <option value="number">number</option>
              <option value="string">string</option>
              <option value="date">date</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm">fillna</label>
          <div v-for="c in props.columns" :key="'fn-'+c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <input class="flex-1" placeholder="값" @input="e => recipe.fillna[c]=(e.target as HTMLInputElement).value" />
          </div>
        </div>

        <div>
          <label class="block text-sm">dropna</label>
          <select multiple class="w-full" v-model="recipe.dropna">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">filter</label>
          <div v-for="(f,i) in recipe.filter" :key="'f-'+i" class="flex gap-2 my-1">
            <select v-model="f.col" class="w-40">
              <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
            </select>
            <select v-model="f.op" class="w-24">
              <option>==</option><option>!=</option><option>&gt;</option><option>&gt;=</option><option>&lt;</option><option>&lt;=</option>
            </select>
            <input v-model="f.value" class="flex-1" placeholder="값" />
          </div>
          <button @click="recipe.filter.push({col:'',op:'>=',value:0})">+ 조건 추가</button>
        </div>

        <div>
          <label class="block text-sm">cap (이상치)</label>
          <div v-for="c in props.columns" :key="'cap-'+c" class="flex items-center gap-2 my-1">
            <span class="w-32 truncate">{{ c }}</span>
            <select @change="e => { const m=(e.target as HTMLSelectElement).value; recipe.cap[c]=m?{method:m,mult:1.5}:undefined }" class="w-28">
              <option value="">(none)</option>
              <option value="iqr">iqr</option>
              <option value="zscore">zscore</option>
            </select>
            <input class="w-24" placeholder="mult/k" @input="e => { const v=Number((e.target as HTMLInputElement).value); if(!recipe.cap[c]) recipe.cap[c]={method:'iqr',mult:1.5}; if(Number.isFinite(v)) recipe.cap[c].mult=v; }" />
          </div>
        </div>

        <div class="md:col-span-2">
          <label class="block text-sm">derive (파생)</label>
          <div v-for="(d,i) in recipe.derive" :key="'d-'+i" class="flex gap-2 my-1">
            <input v-model="d.new" class="w-40" placeholder="새 컬럼명" />
            <input v-model="d.expr" class="flex-1" placeholder="표현식 (예: colA/(colB+1e-9))" />
          </div>
          <button @click="recipe.derive.push({new:'',expr:''})">+ 파생 추가</button>
        </div>

        <div>
          <label class="block text-sm">onehot</label>
          <select multiple class="w-full" v-model="recipe.onehot">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm">scale.standardize</label>
          <select multiple class="w-full" v-model="recipe.scale.standardize">
            <option v-for="c in props.columns" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
    </details>

    <pre class="bg-gray-50 p-2 whitespace-pre-wrap text-xs">{{ log }}</pre>
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
</style>
