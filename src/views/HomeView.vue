<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { listRecent } from '@/stores/useDatasets';
import { deleteDashboard, getDataTypeOptions, listDashboards } from '@/stores/useDashboards';

const router = useRouter();
const dashboards = ref([]);
const recentDatasets = ref([]);

const dataTypeOptions = computed(() => getDataTypeOptions());

function formatRelativeTime(timestamp) {
  const delta = Date.now() - Number(timestamp || 0);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

async function refresh() {
  dashboards.value = listDashboards();
  recentDatasets.value = await listRecent(4);
}

function startDashboard(type) {
  router.push({ name: 'dashboard-new', query: { type } });
}

function openDashboard(id) {
  router.push({ name: 'dashboard', params: { dashboardId: id } });
}

async function removeDashboard(id) {
  if (!confirm('Remove this dashboard from the recent list?')) return;
  deleteDashboard(id);
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="home-view">
    <section class="home-hero">
      <div class="hero-copy">
        <p class="hero-kicker">NGNL Studio</p>
        <h1>Continue recent work or start a new dashboard from a guided flow.</h1>
        <p class="hero-subtitle">
          The entry screen is organized around one clear path: understand the data, create tasks, add analyses,
          and review results without losing context.
        </p>
        <div class="hero-actions">
          <button class="btn-primary" type="button" @click="startDashboard('tabular')">Start new work</button>
          <button type="button" @click="$router.push('/workspace')">Open classic workspace</button>
        </div>
      </div>

      <div class="hero-side">
        <div class="hero-stat">
          <span class="hero-stat__label">Recent dashboards</span>
          <strong>{{ dashboards.length }}</strong>
        </div>
        <div class="hero-stat">
          <span class="hero-stat__label">Recent datasets</span>
          <strong>{{ recentDatasets.length }}</strong>
        </div>
        <router-link class="hero-link" to="/legacy">Open legacy views</router-link>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <div>
          <p class="section-kicker">Start new work</p>
          <h2>Pick the data type first, then open the matching dashboard creation flow.</h2>
        </div>
        <span class="section-meta">Instead of jumping into an empty dashboard, the flow starts with upload, preprocessing, and preview checks.</span>
      </div>

      <div class="type-grid">
        <button
          v-for="option in dataTypeOptions"
          :key="option.id"
          type="button"
          class="type-card"
          @click="startDashboard(option.id)"
        >
          <div class="type-card__head">
            <strong>{{ option.label }}</strong>
            <span>{{ option.shortLabel }}</span>
          </div>
          <p>{{ option.description }}</p>
          <div class="type-card__formats">
            <span v-for="format in option.formats" :key="format">{{ format }}</span>
          </div>
        </button>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <div>
          <p class="section-kicker">Continue existing work</p>
          <h2>Reopen a recent dashboard and continue from the current analysis state.</h2>
        </div>
        <button type="button" @click="refresh">Refresh list</button>
      </div>

      <div v-if="dashboards.length" class="dashboard-grid">
        <article v-for="dashboard in dashboards" :key="dashboard.id" class="dashboard-card">
          <div class="dashboard-card__head">
            <div>
              <p class="dashboard-card__type">{{ dashboard.dataType }}</p>
              <h3>{{ dashboard.title }}</h3>
            </div>
            <span class="dashboard-card__time">{{ formatRelativeTime(dashboard.updatedAt) }}</span>
          </div>
          <p class="dashboard-card__subtitle">{{ dashboard.subtitle || dashboard.description || 'No description yet.' }}</p>
          <div class="dashboard-card__stats">
            <span>Datasets {{ dashboard.datasetIds.length }}</span>
            <span>Tasks {{ dashboard.tasks.length }}</span>
            <span>Analyses {{ dashboard.tasks.reduce((sum, task) => sum + (task.analyses?.length || 0), 0) }}</span>
          </div>
          <div class="dashboard-card__tasks">
            <b>Recent tasks</b>
            <div class="dashboard-card__task-list">
              <span v-for="task in dashboard.tasks.slice(0, 3)" :key="task.id">{{ task.title }}</span>
              <span v-if="!dashboard.tasks.length">No tasks created yet.</span>
            </div>
          </div>
          <div class="dashboard-card__actions">
            <button class="btn-primary" type="button" @click="openDashboard(dashboard.id)">Continue</button>
            <button type="button" @click="removeDashboard(dashboard.id)">Remove</button>
          </div>
        </article>
      </div>

      <div v-else class="empty-card">
        <h3>No dashboards to continue yet.</h3>
        <p>Start with a data type and create the first dashboard from the guided flow.</p>
        <button class="btn-primary" type="button" @click="startDashboard('tabular')">Create first dashboard</button>
      </div>
    </section>

    <section class="home-section home-section--compact">
      <div class="section-head">
        <div>
          <p class="section-kicker">Recent data</p>
          <h2>Reuse an existing dataset before opening a new dashboard flow.</h2>
        </div>
      </div>

      <div v-if="recentDatasets.length" class="recent-datasets">
        <article v-for="dataset in recentDatasets" :key="dataset.id" class="recent-dataset-card">
          <div>
            <h3>{{ dataset.name }}</h3>
            <p>{{ dataset.meta?.rowCount ?? dataset.rows?.length ?? 0 }} rows / {{ dataset.meta?.colCount ?? dataset.columns?.length ?? 0 }} cols</p>
          </div>
          <button type="button" @click="$router.push({ name: 'dashboard-new', query: { reuse: dataset.id } })">Start with this dataset</button>
        </article>
      </div>
      <div v-else class="empty-inline">No recent datasets yet. Upload a file from the new work flow and it will appear here.</div>
    </section>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 24px 24px 40px;
}

.home-hero,
.home-section,
.empty-card,
.recent-dataset-card {
  border: 1px solid #d5ddd5;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 40px rgba(33, 42, 33, 0.06);
}

.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(260px, 0.8fr);
  gap: 18px;
  padding: 28px;
  background:
    radial-gradient(circle at top left, rgba(218, 236, 213, 0.75), transparent 42%),
    linear-gradient(135deg, rgba(255, 252, 243, 0.96), rgba(242, 248, 244, 0.94));
}

.hero-kicker,
.section-kicker,
.dashboard-card__type {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5e6e5d;
}

.hero-copy h1,
.section-head h2,
.empty-card h3 {
  margin: 0;
  color: #1f3325;
}

.hero-copy h1 {
  font-size: 38px;
  line-height: 1.14;
  max-width: 760px;
}

.hero-subtitle,
.section-meta,
.dashboard-card__subtitle,
.empty-card p,
.recent-dataset-card p,
.type-card p {
  color: #58685b;
  line-height: 1.6;
}

.hero-actions,
.dashboard-card__actions,
.section-head,
.hero-side {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-actions {
  margin-top: 18px;
}

button,
.hero-link {
  padding: 10px 14px;
  border: 1px solid #c4cfbf;
  border-radius: 999px;
  background: #fff;
  color: #223228;
  cursor: pointer;
}

.btn-primary {
  border-color: #224d31;
  background: #224d31;
  color: #fff;
}

.hero-side {
  align-content: flex-start;
}

.hero-stat {
  flex: 1 1 100%;
  padding: 16px;
  border: 1px solid rgba(34, 77, 49, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

.hero-stat strong {
  display: block;
  margin-top: 4px;
  font-size: 30px;
  color: #223228;
}

.hero-stat__label {
  font-size: 13px;
  color: #6b7d6f;
}

.hero-link {
  margin-top: auto;
}

.home-section {
  padding: 24px;
}

.section-head {
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 18px;
}

.type-grid,
.dashboard-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.type-card,
.dashboard-card {
  width: 100%;
  padding: 18px;
  border: 1px solid #d8e0d6;
  border-radius: 20px;
  background: linear-gradient(180deg, #ffffff, #f7fbf7);
  text-align: left;
}

.type-card__head,
.dashboard-card__head,
.dashboard-card__stats,
.recent-dataset-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.type-card__head span,
.dashboard-card__time {
  font-size: 12px;
  color: #6b7d6f;
}

.type-card__formats,
.dashboard-card__task-list,
.dashboard-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-card__formats span,
.dashboard-card__task-list span,
.dashboard-card__stats span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #edf3ed;
  font-size: 12px;
  color: #365242;
}

.dashboard-card__tasks {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.dashboard-card__actions {
  margin-top: 18px;
}

.empty-card {
  padding: 32px;
  text-align: center;
}

.home-section--compact {
  padding-bottom: 16px;
}

.recent-datasets {
  display: grid;
  gap: 12px;
}

.recent-dataset-card {
  padding: 16px 18px;
}

.recent-dataset-card h3 {
  margin: 0 0 6px;
}

.recent-dataset-card p {
  margin: 0;
}

.empty-inline {
  padding: 18px;
  border: 1px dashed #c6d0c5;
  border-radius: 18px;
  color: #667768;
  background: #fafcf9;
}

@media (max-width: 980px) {
  .home-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .home-view {
    padding: 16px 16px 28px;
  }

  .hero-copy h1 {
    font-size: 30px;
  }

  .home-hero,
  .home-section {
    padding: 18px;
  }
}
</style>
