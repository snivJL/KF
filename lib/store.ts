type ImportSession = {
    progress: number;
    errors: string[];
    done: boolean;
    aborted: boolean;
  };
  
  let session: ImportSession = {
    progress: 0,
    errors: [],
    done: false,
    aborted: false,
  };
  
  export function resetSession() {
    session = { progress: 0, errors: [], done: false, aborted: false };
  }
  
  export function updateProgress(value: number) {
    session.progress = value;
  }
  
  export function addError(error: string) {
    session.errors.push(error);
  }
  
  export function getSession() {
    return session;
  }
  
  export function setDone() {
    session.done = true;
  }
  
  export function abortImport() {
    session.aborted = true;
  }
  