<template>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th v-for="(col, index) in localTableData.columns" :key="index">
            <input
              v-model="localTableData.columns[index]"
              placeholder="Column Name"
              @input="emitUpdate"
            />
          </th>
          <th><button @click="addColumn">+</button></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in localTableData.rows" :key="rowIndex">
          <td v-for="(cell, colIndex) in row" :key="colIndex">
            <input
              v-model="localTableData.rows[rowIndex][colIndex]"
              @input="emitUpdate"
            />
          </td>
          <td><button @click="removeRow(rowIndex)">-</button></td>
        </tr>
      </tbody>
    </table>
    <button @click="addRow">Add Row</button>
  </div>
</template>

<script>
export default {
  props: {
    tableData: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      localTableData: { columns: [], rows: [] }, // ✅ 초기 데이터 구조 정의
    };
  },
  methods: {
    emitUpdate() {
      this.$emit("update-data", this.localTableData); // ✅ 부모에게 변경된 데이터를 전달
    },
    addRow() {
      this.localTableData.rows.push(
        new Array(this.localTableData.columns.length).fill(""),
      );
      this.emitUpdate();
    },
    removeRow(index) {
      this.localTableData.rows.splice(index, 1);
      this.emitUpdate();
    },
    addColumn() {
      this.localTableData.columns.push(
        `Column ${this.localTableData.columns.length + 1}`,
      );
      this.localTableData.rows.forEach((row) => row.push(""));
      this.emitUpdate();
    },
    initializeLocalData() {
      // ✅ tableData를 localTableData에 복사
      this.localTableData = JSON.parse(JSON.stringify(this.tableData));
    },
  },
  watch: {
    tableData: {
      handler() {
        console.log("📊 데이터 업데이트 감지:", this.tableData);
        this.initializeLocalData(); // ✅ 데이터 초기화 함수 호출
      },
      immediate: true, // ✅ 컴포넌트 초기화 시에도 실행
      deep: true,
    },
  },
};
</script>

<style>
.table-container {
  width: 100%;
  height: 100%;
  padding: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

th,
td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
  min-width: 100px;
  white-space: nowrap;
}

input {
  width: 100%;
  border: none;
  outline: none;
  padding: 5px;
}

button {
  padding: 5px 10px;
  cursor: pointer;
}
</style>
