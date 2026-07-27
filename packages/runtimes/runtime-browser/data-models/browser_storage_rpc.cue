package runtime_browser

#BrowserPersistenceStatus: {
	mode:   "opfs-sahpool" | "transient-memory" | "unavailable"
	reason?: string
}

#BrowserStorageRpcRequest: {
	id:      string & !=""
	op:      string & !=""
	payload: bytes
}
