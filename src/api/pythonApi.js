import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

export const runPythonScript = async (scriptName, args = []) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/run-python`, {
      scriptName,
      args,
    });
    return response.data.output;
  } catch (error) {
    console.error("Error executing Python script:", error);
    throw error;
  }
};
