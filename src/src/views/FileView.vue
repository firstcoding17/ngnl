<template>
  <div class="file-view">
    <h1>File Management</h1>
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
  </div>
</template>

<script>
import axios from "axios";
import * as XLSX from "xlsx";

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
        const uploadResponse = await axios.post(
          "http://localhost:5000/api/upload",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        console.log("Upload complete:", uploadResponse.data);

        // 2) Process uploaded file (`/api/process`)
        console.log("Processing file...");
        const processResponse = await axios.post(
          "http://localhost:5000/api/process",
          { filename: uploadResponse.data.filename },
          { headers: { "Content-Type": "application/json" } },
        );

        console.log("Python process result:", processResponse.data);
        this.localTableData = processResponse.data;
        this.$emit("file-loaded", processResponse.data);
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
      const { columns, rows } = this.localTableData; const data = [columns, ...rows];
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
</style>
