import http from "./http";

export const runPythonScript = async (scriptName, args = []) => {
  try {
    const { data } = await http.post('/api/run-python', { scriptName, args });
    if (data?.ok === false) {
      throw new Error(data.message || 'python script execution failed');
    }
    return data.output;
  } catch (error) {
    console.error("Error executing Python script:", error);
    throw error;
  }
};
