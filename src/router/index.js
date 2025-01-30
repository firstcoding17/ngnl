import { createRouter, createWebHistory } from "vue-router";
import FileView from "../views/FileView.vue";
import GraphView from "../views/GraphView.vue";
import StatView from "../views/StatView.vue";

const routes = [
  { path: "/file", component: FileView },
  { path: "/graph", component: GraphView },
  { path: "/stat", component: StatView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
