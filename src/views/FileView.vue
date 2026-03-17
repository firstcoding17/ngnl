<template>
  <div class="file-view">
    <h1>File Management</h1>
    <div class="legacy-nav">
      <router-link to="/legacy/file">File</router-link>
      <router-link to="/legacy/graph">Graph</router-link>
      <router-link to="/legacy/stat">Stat</router-link>
    </div>
    <div class="file-actions">
      <input
        type="file"
        ref="fileInput"
        style="display: none"
        @change="handleFileUpload"
        accept=".csv, .xlsx"
      />
      <button @click="triggerFileUpload">Load File</button>
      <button @click="saveFile">Save File</button>
      <button @click="saveFile('csv')">Save as CSV</button>
      <button @click="saveFile('excel')">Save as Excel</button>
      <button @click="createNewFile">New File</button>
    </div>
    <p v-if="loading">Uploading file...</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="localTableData?.columns?.length" class="dataset-ready">
      <p>
        Dataset loaded:
        <b>{{ localTableData.rows?.length || 0 }}</b> rows /
        <b>{{ localTableData.columns?.length || 0 }}</b> columns
      </p>
      <div class="next-actions">
        <button @click="goGraph">Open Graph View</button>
        <button @click="goStat">Open Stat View</button>
      </div>
    </div>
  </div>
</template>

<script>
import http from "@/api/http";
import * as XLSX from "xlsx";

const LEGACY_DATA_KEY = "legacy_table_data";

export default {
  props: {
    tableData: {
      type: Object,
      default: () => null,
    },
  },
  data() {
    return {
      localTableData: null,
      fileContent: "", loading: false,
      error: null,
    };
  },
  methods: {
    normalizeRows(rows, columns) {
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        if (Array.isArray(row)) return row;
        return columns.map((column) => row?.[column] ?? "");
      });
    },
    goGraph() {
      this.$router.push("/legacy/graph");
    },
    goStat() {
      this.$router.push("/legacy/stat");
    },
    promptNextView() {
      const moveToGraph = window.confirm("Dataset loaded. Open Graph View now?");
      if (moveToGraph) this.goGraph();
    },
    triggerFileUpload() {
      // Open hidden file input
      this.$refs.fileInput.click();
    },
    async handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      this.loading = true;
      this.error = null;

      // Build multipart form data
      const formData = new FormData();
      formData.append("file", file);

      try {
        // 1) Upload file (`/api/upload`)
        console.log("Uploading file...");
        const uploadResponse = await http.post(
          "/api/upload",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        console.log("Upload complete:", uploadResponse.data);

        // 2) Process uploaded file (`/api/process`)
        console.log("Processing file...");
        const processResponse = await http.post(
          "/api/process",
          { filename: uploadResponse.data.filename },
          { headers: { "Content-Type": "application/json" } },
        );

        console.log("Python process result:", processResponse.data);
        const payload = processResponse.data?.data ?? processResponse.data;
        if (!payload?.columns || !payload?.rows) {
          throw new Error("Invalid process response");
        }
        this.localTableData = { columns: payload.columns, rows: payload.rows };
        localStorage.setItem(LEGACY_DATA_KEY, JSON.stringify(this.localTableData));
        this.$emit("file-loaded", this.localTableData);
        this.promptNextView();
      } catch (err) {
        this.error = "File upload or processing failed.";
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
    saveFile(format = "csv") {
      console.log("Data to save:", this.localTableData);
      if (!this.localTableData) {
        alert("No data to save.");
        return;
      }
      const { columns, rows } = this.localTableData;
      const normalizedRows = this.normalizeRows(rows, columns);
      const data = [columns, ...normalizedRows];
      if (format === "csv") {
        const csvContent = data.map((row) => row.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "saved_data.csv";
        link.click();
      } else if (format === "excel") {
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, "saved_data.xlsx");
      }
    },
    createNewFile() {
      this.$emit("create-new-file");
    },
  },
  watch: {
    tableData: {
      immediate: true,
      deep: true,
      handler(newVal) {
        console.log("tableData changed:", newVal);
        this.localTableData = JSON.parse(JSON.stringify(newVal));
      },
    },
  },
};
</script>
<style>
.file-view {
  padding: 20px;
}
.file-actions {
  margin-bottom: 20px;
}
.legacy-nav {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
}
.legacy-nav a {
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  color: #333;
  text-decoration: none;
}
.legacy-nav a.router-link-active {
  border-color: #2563eb;
  color: #1d4ed8;
}
.file-actions button {
  margin-right: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 5px;
}
.file-actions button:hover {
  background-color: #f0a500;
}
.error {
  color: red;
  font-weight: bold;
}
.dataset-ready {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  padding: 10px;
}
.next-actions {
  display: flex;
  gap: 8px;
}
</style>
