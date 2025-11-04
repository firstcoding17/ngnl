<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import ProfilePanel from './ProfilePanel.vue';
import RecentDatasets from './RecentDatasets.vue';
import { saveDataset } from '@/stores/useDatasets';
import RecipePanel from './RecipePanel.vue'
import DataGrid from './DataGrid.vue'
import { tempUpload, tempDelete } from '@/services/tempUpload';
import { exportXLSX } from '@/services/exportXlsx';
import DownloadMenu from './DownloadMenu.vue';
import Toast from './Toast.vue';



const worker = new Worker(new URL('../workers/ingest.worker.js', import.meta.url), { type:'module' });

const dragOver = ref(false);
const fileInput = ref<HTMLInputElement|null>(null);
const rows = ref<any[]>([]);
const columns = ref<string[]>([]);
const meta  = ref({ count: 0, memMB: 0 });
const log = ref('');
const status = ref<'idle'|'parsing'|'done'>('idle');
const progress = ref<{mode:string, pct:null|number}>({ mode: '', pct: null });
const tempMode = ref(false);
const tempBusy = ref(false);
const tempKey = ref<string|undefined>(undefined);
const badge = computed(() => {
  if (tempMode.value && tempKey.value) return 'temp cached';
  return status.value==='done' ? 'data on desk!' : '';
});
const toastRef = ref<InstanceType<typeof Toast> | null>(null);
const gridRef = ref<any>(null);

const currentName = ref<string>('untitled');
const dirty = ref<boolean>(false);


function append(s:string){ log.value += s + '\n'; }

onMounted(()=>{
  worker.onmessage = (e: MessageEvent<any>) => {
    const { type, ok, data, error } = e.data;
    if (type === 'PROGRESS' && ok) {
      status.value = 'parsing';
      progress.value = data; // { mode, pct }
      return;
    }
    if (!ok) { append('❌ ' + error); status.value = 'idle'; return; }
    if (type === 'FILE' || type === 'PASTE') {
    rows.value = data.rows;
    columns.value = data.columns;
    meta.value.count = data.count;
    meta.value.memMB = estimateMB(rows.value);
    currentName.value = 'untitled';
    dirty.value = true;             // ✅ 변경됨
    append(`✅ 로드 완료: ${data.count}행, ${columns.value.length}열, ~${meta.value.memMB.toFixed(2)} MB`);
    status.value = 'done';
    progress.value = { mode:'', pct:null };
      
    }
  };
  window.addEventListener('paste', onPaste);
});
onBeforeUnmount(()=>{
  worker.terminate();
  window.removeEventListener('paste', onPaste);
});

function onFilePick(e: Event){
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  lastFile = f;
  worker.postMessage({ type:'FILE', payload:{ file: f }});
}
function onDrop(e: DragEvent){
  e.preventDefault(); dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  lastFile = f;
  worker.postMessage({ type:'FILE', payload:{ file: f }});
}
/* onFilePick / onDrop 로딩 완료 직후 업로드 */
async function maybeTempUpload(latestFile?: File){
  if (!tempMode.value || !latestFile) return;
  tempBusy.value = true;
  try {
    const { key } = await tempUpload(latestFile);
    tempKey.value = key;
    append(`☁️ 임시 업로드 완료: ${key}`);
  } catch (e:any) {
    append('❌ 임시 업로드 실패: ' + (e?.message || e));
  } finally {
    tempBusy.value = false;
  }
}
let lastFile: File|undefined;


function onPaste(e: ClipboardEvent){
  const html = e.clipboardData?.getData('text/html') || '';
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!html && !text) return;
  worker.postMessage({ type:'PASTE', payload:{ text, html }});
}

function onApplyRecipe(d:{rows:any[], columns:string[]}){
  rows.value = d.rows; columns.value = d.columns;
  meta.value.memMB = estimateMB(rows.value);
  dirty.value = true;  // ✅
  append(`🧪 레시피 적용: ${rows.value.length}행 / ${columns.value.length}열`);
}

function onGridUpdate(r:any[]){ rows.value = r; meta.value.memMB = estimateMB(rows.value); dirty.value = true; } // ✅
function onColumnsUpdate(cols:string[]){ columns.value = cols; dirty.value = true; }

function estimateMB(arr:any[]){
  try { return new Blob([JSON.stringify(arr)]).size / 1024 / 1024; }
  catch { return 0; }
}

// “새 데이터 생성/저장” — IndexedDB 연동
function openNewDataset(){
  const schemaStr = prompt('컬럼명을 콤마로 입력하세요 (예: colA,colB,target)');
  if (!schemaStr) return;
  const cols = schemaStr.split(',').map(s => s.trim()).filter(Boolean);
  rows.value = [];
  columns.value = cols;
  currentName.value = 'untitled';
  dirty.value = true;   // ✅
  status.value = 'done';
  progress.value = { mode:'', pct:null };
  append(`🆕 새 데이터 스키마 생성: ${cols.join(', ')}`);
}

async function saveCurrent(){
  if (!rows.value.length && !columns.value.length) return;
  const name = prompt('데이터셋 이름을 입력하세요', currentName.value || `dataset-${new Date().toISOString().slice(0,19).replace('T',' ')}`);
  if (!name) return;
  await saveDataset(name, columns.value, rows.value);
  currentName.value = name;
  dirty.value = false;                              // ✅ 저장됨
  append('💾 IndexedDB에 저장했습니다.');
  toastRef.value?.show('저장 완료');
}

// 최근 목록에서 “열기” 이벤트
function onOpenRecent(payload:{ rows:any[], columns:string[], name:string, id:string }){
  rows.value = payload.rows;
  columns.value = payload.columns;
  currentName.value = payload.name;
  dirty.value = false;                    // ✅ 저장본
  status.value = 'done';
  progress.value = { mode:'', pct:null };
  append(`📂 불러오기: ${payload.name} (${payload.rows.length}행, ${payload.columns.length}열)`);
}

/* 작업 종료(즉시 삭제) */
async function endSession(){
  if (!tempKey.value) return;
  if (!confirm('임시 캐시를 즉시 삭제할까요?')) return;
  try {
    await tempDelete(tempKey.value);
    append(`🧹 삭제 완료: ${tempKey.value}`);
    tempKey.value = undefined;
  } catch (e:any) {
    append('❌ 삭제 실패: ' + (e?.message || e));
  }
}

function downloadXlsx(){
  exportXLSX('dataset', columns.value, rows.value, {
    sample: 3000,     
    minWch: 8,        
    maxWch: 50,       
    autoFilter: true, 
  });
}

function onGraphFilter(p:{key:string, value:any}){
  // 예: { key: 'species', value: 'setosa' }
  gridRef.value?.filterEquals(p.key, p.value);
}

function onGraphFocus(p:{rowIndex:number}){
  gridRef.value?.focusRow(p.rowIndex);
}
</script>

<template>
  <div class="p-4 space-y-3">
    <div class="flex items-center gap-2">
      <h2 class="text-xl font-semibold">데이터 인입 (로컬)</h2>
  <span v-if="badge" class="text-xs px-2 py-1 rounded bg-green-100 text-green-700 border border-green-300">
    {{ badge }}
  </span>

  <div class="ml-3 text-sm text-gray-600">
    <b>{{ currentName }}</b><span v-if="dirty">*</span>
    <span class="ml-2 text-xs text-gray-500">
      (행: {{ rows.length }} / 열: {{ columns.length }}<template v-if="rows.length"> · ~{{ meta.memMB.toFixed(2) }}MB</template>)
    </span>
  </div>

<!-- ✅ 우측 툴바: 필터 초기화 + 다운로드 메뉴 -->
  <div class="ml-auto flex items-center gap-2">
    <button class="ml-2" @click="gridRef?.clearFilters()">필터 초기화</button>
    <DownloadMenu :name="currentName" :columns="columns" :rows="rows" />
  </div>
      <label class="ml-auto text-sm flex items-center gap-1">
      <input type="checkbox" v-model="tempMode" />
      임시 업로드(작업 중만)
    </label>
    <button v-if="tempKey" :disabled="tempBusy" @click="endSession">작업 종료(삭제)</button>
    </div>

    <div class="flex gap-2">
      <button @click="openNewDataset()">+ 새 데이터</button>
      <button :disabled="!rows.length && !columns.length" @click="saveCurrent()">현재 데이터 저장</button>
      <button :disabled="!rows.length" @click="downloadXlsx()">XLSX 다운로드</button>
    </div>

    <div
      class="border-2 border-dashed rounded-lg p-6 text-center"
      :class="dragOver ? 'bg-blue-50 border-blue-400' : 'border-gray-300'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop="onDrop"
    >
      <p class="mb-2">여기로 <b>드래그&드롭</b> 하거나,</p>
      <button @click="fileInput?.click()">파일 선택</button>
      <input ref="fileInput" type="file" class="hidden" @change="onFilePick"
             accept=".csv,.xlsx,.json,text/csv,application/json" />
      <p class="mt-2 text-sm text-gray-500">또는 <b>Ctrl+V</b>로 표/CSV/JSON을 붙여넣기</p>
    </div>

    <!-- 진행 바 -->
    <div v-if="status==='parsing'" class="w-full bg-gray-100 rounded h-2 overflow-hidden">
      <div class="bg-blue-500 h-2 transition-all"
           :style="{ width: (progress.pct==null ? '100%' : progress.pct+'%'),
                     animation: (progress.pct==null ? 'indet 1.2s linear infinite' : 'none') }">
      </div>
      <div class="text-xs mt-1 text-gray-600">
        {{ progress.mode.toUpperCase() }} {{ progress.pct==null ? '(분석 중...)' : progress.pct + '%' }}
      </div>
    </div>

    <div v-if="rows.length || columns.length" class="text-sm text-gray-700">
      <span>행: <b>{{ rows.length }}</b></span> ·
      <span>열: <b>{{ columns.length }}</b></span>
      <template v-if="rows.length">
        · <span>메모리 추정: <b>{{ meta.memMB.toFixed(2) }} MB</b></span>
      </template>
    </div>

    <details v-if="rows.length" class="p-3 border rounded">
      <summary class="font-semibold">미리보기 (상위 20행)</summary>
      <div class="overflow-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th v-for="c in columns" :key="c" class="border px-2 py-1 text-left whitespace-nowrap">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r,i) in rows.slice(0,20)" :key="i">
              <td v-for="c in columns" :key="c" class="border px-2 py-1 whitespace-nowrap">{{ r[c] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
      <RecipePanel
    v-if="rows.length || columns.length"
    :rows="rows"
    :columns="columns"
    @apply="onApplyRecipe"
  />
  <GraphPanel
  v-if="rows.length && columns.length"
  :rows="rows"
  :columns="columns"
  @applyFilter="onGraphFilter"
  @focusRow="onGraphFocus"
/>

<DataGrid
  ref="gridRef"
  v-if="rows.length || columns.length"
  :rows="rows"
  :columns="columns"
  @update="onGridUpdate"
  @columns="onColumnsUpdate"
/>

    <ProfilePanel v-if="rows.length" :rows="rows" />
    <RecentDatasets @open="onOpenRecent" />

    <pre class="bg-gray-50 p-2 whitespace-pre-wrap text-xs">{{ log }}</pre>

  <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
button { padding:6px 10px; border:1px solid #ddd; border-radius:8px; cursor:pointer; }
@keyframes indet {
  0%{ transform: translateX(-100%); width: 30%; }
  50%{ transform: translateX(50%); width: 40%; }
  100%{ transform: translateX(200%); width: 30%; }
}
</style>



