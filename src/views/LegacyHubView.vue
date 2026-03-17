<template>
  <div class="legacy-hub">
    <h2>Legacy Views</h2>
    <p class="subtitle">Use this hub to navigate existing legacy pages and add future view entries.</p>
    <div class="quick-nav">
      <router-link to="/">Open New Workspace</router-link>
    </div>

    <div class="cards">
      <router-link class="card" to="/legacy/file">
        <h3>File View</h3>
        <p>Upload/process legacy datasets.</p>
      </router-link>
      <router-link class="card" to="/legacy/graph">
        <h3>Graph View</h3>
        <p>Generate graph images from legacy flow.</p>
      </router-link>
      <router-link class="card" to="/legacy/stat">
        <h3>Stat View</h3>
        <p>Run legacy statistics on /stat/run contract.</p>
      </router-link>
      <div class="card placeholder">
        <h3>Future View Slot</h3>
        <p>Add new legacy routes here as new views are introduced.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legacy-hub {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subtitle {
  margin-top: -4px;
  color: #666;
  font-size: 13px;
}

.quick-nav a {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #333;
  text-decoration: none;
}

.cards {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 12px;
  text-decoration: none;
  color: inherit;
}

.card h3 {
  margin: 0 0 6px 0;
  font-size: 15px;
}

.card p {
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}

.card.placeholder {
  background: #f9fafb;
}
</style>
