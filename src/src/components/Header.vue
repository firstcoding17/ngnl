<template>
  <header class="Appheader">
    <nav class="nav">
      <ul>
        <li><router-link to="/file">File</router-link></li>
        <li><router-link to="/graph">Graph</router-link></li>
        <li><router-link to="/stat">Stat</router-link></li>
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
  margin: 0; /* 기본 마진 제거 */
  padding: 0; /* 기본 패딩 제거 */
}
.header {
  position: fixed; /* 화면 맨 위에 고정 */
  top: 0;
  left: 0;
  width: 100%; /* 헤더가 전체 너비를 차지 */
  z-index: 1000; /* 다른 요소 위에 표시되도록 설정 */
  display: flex;
  justify-content: flex-start; /* 왼쪽 정렬 */
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
  margin-left: 0; /* 왼쪽에 붙이기 */
}
.nav a {
  text-decoration: none;
  color: white;
}
</style>
