<template>
  <div class="app-container">
    <!-- 헤더 -->
    <header class="header">
      <nav class="nav">
        <ul>
          <li @click="toggleSidebar('file')">File</li>
          <li @click="toggleSidebar('graph')">Graph</li>
          <li @click="toggleSidebar('stat')">Stat</li>
        </ul>
      </nav>
    </header>

    <!-- 사이드바 -->
    <aside class="sidebar" :class="{ open: isSidebarOpen }">
      <button class="close-btn" @click="closeSidebar">Close</button>
      <component
        :is="activeSidebarComponent"
        v-if="isSidebarOpen"
        @create-new-file="createNewTab"
        @file-loaded="handleFileLoaded"
        :table-data="tabs[activeTab]?.data"
      />
    </aside>

    <!-- 탭 UI -->
    <div class="tabs-container">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === index }"
        @click="activeTab = index"
      >
        {{ tab.name }}
        <span class="close-btn" @click.stop="closeTab(index)">✖</span>
      </div>
    </div>

    <!-- 사이드바 -->
    <aside v-if="isSidebarOpen" class="sidebar">
      <button class="close-btn" @click="closeSidebar">Close</button>
      <component
        :is="activeSidebarComponent"
        @create-new-file="createNewTab"
        @file-loaded="handleFileLoaded"
        :table-data="tabs[activeTab]?.data"
      />
    </aside>

    <!-- 메인 콘텐츠 (스크롤바 1개로 통합) -->
    <main class="main-content">
      <div class="table-wrapper">
        <TableComponent
          v-if="tabs.length > 0"
          :tableData="tabs[activeTab].data"
          @update-data="updateTabData"
        />
      </div>
    </main>
    <!-- ✅ 공통 드래그바 추가 -->
    <div class="resize-handle" @mousedown="startResize"></div>
  </div>
</template>

<script>
import { markRaw, toRaw } from "vue";
import FileView from "./views/FileView.vue";
import GraphView from "./views/GraphView.vue";
import StatView from "./views/StatView.vue";
import TableComponent from "./components/TableComponent.vue";

export default {
  data() {
    return {
      tabs: [], // 여러 개의 테이블을 저장하는 배열
      activeTab: 0, // 현재 선택된 탭
      isSidebarOpen: false, // 사이드바 열림 여부
      activeSidebarComponent: null, // 현재 사이드바에서 표시할 컴포넌트
      tableHeight: "80vh",
    };
  },
  components: {
    FileView,
    GraphView,
    StatView,
    TableComponent,
  },
  methods: {
    startResize(event) {
      const startY = event.clientY;
      const startHeight = this.$refs.tableWrapper.offsetHeight;
      const onMouseMove = (moveEvent) => {
        const newHeight = startHeight + (moveEvent.clientY - startY);
        this.tableHeight = `${newHeight}px`;
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    updateTabData(newData) {
      if (this.tabs.length > 0) {
        this.tabs[this.activeTab].data = newData;
      }
    },
    toggleSidebar(componentName) {
      const selectedComponent = markRaw(
        this.getSidebarComponent(componentName),
      ); // ✅ markRaw 적용

      if (
        this.isSidebarOpen &&
        toRaw(this.activeSidebarComponent) === selectedComponent
      ) {
        this.closeSidebar();
      } else {
        this.activeSidebarComponent = selectedComponent;
        this.isSidebarOpen = true;
      }
    },
    getSidebarComponent(componentName) {
      switch (componentName) {
        case "file":
          return FileView;
        case "graph":
          return GraphView;
        case "stat":
          return StatView;
        default:
          return null;
      }
    },
    closeSidebar() {
      this.isSidebarOpen = false;
      this.activeSidebarComponent = null;
    },
    handleFileLoaded(data) {
      console.log("📊 로드된 파일 데이터:", data);

      if (this.tabs.length > 0) {
        // ✅ 현재 활성화된 탭에 데이터를 저장
        this.tabs[this.activeTab].data = data;
      }
    },
    createNewTab() {
      const newTab = {
        id: Date.now(),
        name: `File ${this.tabs.length + 1}`,
        data: { rows: [[""]], columns: ["Column 1"] },
      };
      this.tabs.push(newTab);
      this.activeTab = this.tabs.length - 1;
    },
    closeTab(index) {
      this.tabs.splice(index, 1);
      if (this.tabs.length === 0) {
        this.activeTab = -1;
      } else if (index <= this.activeTab) {
        this.activeTab = Math.max(0, this.activeTab - 1);
      }
    },
  },
  mounted() {
    this.createNewTab(); // 웹이 로드될 때 기본 테이블 하나 생성
  },
};
</script>

<style>
/* 기존 스타일 유지 */
html,
body {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  height: 100vh;
}

/* 앱 컨테이너 */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden; /* 개별 요소에서 스크롤 제거 */
}

/* 헤더 스타일 */
.header {
  width: 100%;
  background-color: #333;
  color: white;
  padding: 10px;
}

.nav ul {
  list-style: none;
  padding: 0;
  display: flex;
  justify-content: flex-start; /* 왼쪽 정렬 */
  margin: 0;
}

.nav ul li {
  cursor: pointer;
  padding: 10px;
  color: white;
}

.nav ul li:hover {
  color: #f0a500;
}

/* 사이드바 */
.sidebar {
  position: fixed;
  left: 0;
  top: 50px;
  height: 100%;
  width: 300px;
  background-color: #444;
  color: white;
  padding: 20px;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
  z-index: 1000;
  transform: translateX(-100%);
  transition: transform 0.3s ease-in-out;
}

.sidebar.open {
  transform: translateX(0);
}

/* 탭 스타일 */
.tabs-container {
  display: flex;
  padding: 10px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  overflow: hidden; /* ✅ 스크롤바 제거 */
  flex-wrap: nowrap; /* ✅ 탭이 줄 바꿈되지 않도록 함 */
  white-space: nowrap; /* 탭이 많아질 때 줄바꿈 방지 */
  overflow-x: auto; /* 좌우 스크롤만 활성화 */
}

.tab {
  padding: 8px 15px;
  cursor: pointer;
  background: #ddd;
  margin-right: 5px;
  border-radius: 5px 5px 0 0;
  min-width: 100px; /* ✅ 탭의 최소 크기 지정 */
  flex-grow: 0; /* ✅ 크기 자동 확장 방지 */
}

.tab.active {
  background: #fff;
  font-weight: bold;
  border-bottom: 2px solid #333;
}

.close-btn {
  margin-left: 8px;
  cursor: pointer;
  color: red;
}

/* 테이블을 감싸는 래퍼 */
.table-wrapper {
  flex: 1;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 100%;
  max-width: none;
  height: auto;
  overflow: visible;
  padding-bottom: 15px; /* ✅ 드래그바와 테이블 겹치지 않도록 여백 추가 */
}

table {
  width: auto; /* ✅ 기본적으로 자동 크기 조절 */
  border-collapse: collapse;
  table-layout: fixed; /* ✅ 컬럼 크기를 균등하게 유지 */
  min-width: 100%; /* ✅ 테이블 최소 크기를 설정 */
}
.resize-handle {
  height: 12px; /* 기존보다 크기 키움 */
  background: #555; /* 더 진한 색상 */
  cursor: ns-resize;
  position: relative; /* ✅ `absolute`에서 `relative`로 변경 */
  bottom: 0;
  width: 100%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
  font-weight: bold;
  border-top: 2px solid #333; /* ✅ 드래그바가 명확하게 보이도록 추가 */
  margin-top: 5px; /* ✅ 테이블과 간격 추가 */
}
.main-content {
  flex: 1;
  overflow: auto;
  padding: 20px;
  margin-top: 60px; /* 헤더와 겹치지 않도록 조정 */
}
</style>
