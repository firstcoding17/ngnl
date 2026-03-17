<template>
  <header class="Appheader">
    <nav class="nav">
      <ul>
        <li><router-link to="/">New</router-link></li>
        <li><router-link to="/legacy/file">File</router-link></li>
        <li><router-link to="/legacy/graph">Graph</router-link></li>
        <li><router-link to="/legacy/stat">Stat</router-link></li>
      </ul>
    </nav>
  </header>
</template>

<script>
export default {
  name: "AppHeader",
};
</script>

<style scoped>
body,
html {
  margin: 0; /* remove default margin */
  padding: 0; /* remove default padding */
}
.Appheader {
  position: fixed; /* keep header fixed at the top */
  top: 0;
  left: 0;
  width: 100%; /* full width */
  z-index: 1000; /* render above other elements */
  display: flex;
  justify-content: flex-start; /* left-align content */
  align-items: center;
  padding: 10px 20px;
  background-color: #333;
  color: white;
}

.nav ul {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 15px;
}

.nav {
  margin-left: 0; /* stick to the left */
}
.nav a {
  text-decoration: none;
  color: white;
}
</style>
