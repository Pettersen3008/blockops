package httpapi

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func (s *Server) backups(w http.ResponseWriter, r *http.Request) {
	backups, err := s.store.ListBackups(r.Context())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": backups})
}

func (s *Server) createBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	user := sessionFrom(r.Context()).User
	backup, err := s.operations.CreateBackup(r.Context(), user.Username)
	if err != nil {
		s.audit(r, "backup.create", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "backup_failed", "The backup could not be created safely.")
		return
	}
	s.audit(r, "backup.create", backup.ID, "success", map[string]any{"sizeBytes": backup.SizeBytes}, nil)
	writeJSON(w, http.StatusCreated, backup)
}

func (s *Server) deleteBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.operations.DeleteBackup(r.Context(), id); err != nil {
		s.audit(r, "backup.delete", id, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusNotFound, "backup_not_found", "The backup was not found.")
		return
	}
	s.audit(r, "backup.delete", id, "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) downloadBackup(w http.ResponseWriter, r *http.Request) {
	backup, path, err := s.operations.BackupPath(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "backup_not_found", "The backup was not found.")
		return
	}
	file, err := os.Open(path)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="blockops-backup-%s.tar.gz"`, backup.ID))
	w.Header().Set("Content-Type", "application/gzip")
	s.audit(r, "backup.download", backup.ID, "success", nil, nil)
	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
}

func (s *Server) restoreBackup(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.operations.RestoreBackup(r.Context(), id); err != nil {
		s.audit(r, "backup.restore", id, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "restore_failed", "The backup could not be restored. The prior world was preserved when possible.")
		return
	}
	s.audit(r, "backup.restore", id, "success", nil, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "restored"})
}

func (s *Server) downloadWorld(w http.ResponseWriter, r *http.Request) {
	path, err := s.operations.PrepareWorldDownload(r.Context())
	if err != nil {
		s.audit(r, "world.download", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusServiceUnavailable, "world_download_failed", "A consistent world archive could not be prepared.")
		return
	}
	defer os.Remove(path)
	file, err := os.Open(path)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.tar.gz"`, s.config.WorldName, time.Now().UTC().Format("20060102-150405")))
	w.Header().Set("Content-Type", "application/gzip")
	s.audit(r, "world.download", s.config.WorldName, "success", map[string]any{"sizeBytes": info.Size()}, nil)
	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
}

func (s *Server) replaceWorld(w http.ResponseWriter, r *http.Request) {
	if !s.requireCSRF(w, r) {
		return
	}
	if r.ContentLength > s.config.MaxUploadBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "upload_too_large", "The world ZIP exceeds the configured upload limit.")
		return
	}
	if err := os.MkdirAll(s.config.BackupDir, 0o750); err != nil {
		s.internalError(w, r, err)
		return
	}
	temporary, err := os.CreateTemp(s.config.BackupDir, ".blockops-upload-*.zip")
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	path := temporary.Name()
	defer os.Remove(path)
	r.Body = http.MaxBytesReader(w, r.Body, s.config.MaxUploadBytes)
	_, copyErr := io.Copy(temporary, r.Body)
	closeErr := temporary.Close()
	if copyErr != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "upload_too_large", "The world ZIP exceeds the configured upload limit.")
		return
	}
	if closeErr != nil {
		s.internalError(w, r, closeErr)
		return
	}
	if err := s.operations.ReplaceWorldZip(r.Context(), path); err != nil {
		s.audit(r, "world.replace", s.config.WorldName, "failure", map[string]any{"error": safeOutcome(err)}, nil)
		writeError(w, http.StatusUnprocessableEntity, "world_replace_failed", "The uploaded ZIP was unsafe or could not replace the world.")
		return
	}
	s.audit(r, "world.replace", s.config.WorldName, "success", nil, nil)
	writeJSON(w, http.StatusOK, map[string]string{"status": "replaced"})
}
