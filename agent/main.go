package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	Token    string `json:"token"`
	ApiURL   string `json:"api_url"`
	Interval int    `json:"interval_min"`
}

type Metrics struct {
	CPUUsage        float64 `json:"cpu"`
	CPUCores        int     `json:"cpu_cores"`
	MemoryTotalMB   int64   `json:"memory_total_mb"`
	MemoryAvailMB   int64   `json:"memory_avail_mb"`
	MemoryUsedMB    int64   `json:"memory_used_mb"`
	MemoryPercent   float64 `json:"memory_percent"`
	DiskTotalGB     float64 `json:"disk_total_gb"`
	DiskUsedGB      float64 `json:"disk_used_gb"`
	DiskPercent     float64 `json:"disk_percent"`
	LoadAvg1        float64 `json:"load_avg_1"`
	LoadAvg5        float64 `json:"load_avg_5"`
	LoadAvg15       float64 `json:"load_avg_15"`
}

type ContainerStatus struct {
	ID         string  `json:"id,omitempty"`
	Name       string  `json:"name"`
	Image      string  `json:"image,omitempty"`
	State      string  `json:"state,omitempty"`
	Status     string  `json:"status,omitempty"`
	CPUPercent float64 `json:"cpuPercent,omitempty"`
	MemUsage   string  `json:"memUsage,omitempty"`
	MemPercent float64 `json:"memPercent,omitempty"`
	NetIO      string  `json:"netIO,omitempty"`
	BlockIO    string  `json:"blockIO,omitempty"`
	PIDs       int64   `json:"pids,omitempty"`
}

type Payload struct {
	Token      string            `json:"token"`
	Metrics    Metrics           `json:"metrics"`
	Containers []ContainerStatus `json:"containers"`
}

const defaultConfigPath = "/etc/vaultrix-agent/config.json"
const cronPath = "/etc/cron.d/vaultrix-agent"

func main() {
	var token string
	var apiURL string
	var interval int
	var install bool
	var uninstall bool
	var once bool
	var status bool
	var configPath string

	flag.StringVar(&token, "token", "", "Token da maquina")
	flag.StringVar(&apiURL, "api-url", "", "URL da API")
	flag.IntVar(&interval, "interval", 1, "Intervalo em minutos")
	flag.BoolVar(&install, "install", false, "Instala e agenda o agente")
	flag.BoolVar(&uninstall, "uninstall", false, "Remove o agente")
	flag.BoolVar(&once, "once", false, "Executa uma coleta unica")
	flag.BoolVar(&status, "status", false, "Verifica se esta instalado")
	flag.StringVar(&configPath, "config", defaultConfigPath, "Caminho do config")
	flag.Parse()

	if status {
		installed := fileExists(cronPath)
		if installed {
			fmt.Println("INSTALLED")
		} else {
			fmt.Println("NOT_INSTALLED")
		}
		return
	}

	if uninstall {
		_ = os.Remove(cronPath)
		fmt.Println("Agendamento removido.")
		return
	}

	if install {
		cfg := Config{Token: token, ApiURL: apiURL, Interval: interval}
		if err := validateConfig(cfg); err != nil {
			fatal(err)
		}
		if err := installAgent(cfg, configPath); err != nil {
			fatal(err)
		}
		fmt.Println("Agente instalado.")
		return
	}

	cfg, err := loadConfig(configPath)
	if err != nil {
		// fallback para flags
		cfg = Config{Token: token, ApiURL: apiURL, Interval: interval}
		if err := validateConfig(cfg); err != nil {
			fatal(err)
		}
	}

	if err := runOnce(cfg); err != nil {
		fatal(err)
	}

	if !once {
		// modo padrao: executa uma vez e sai
		return
	}
}

func runOnce(cfg Config) error {
	metrics, err := collectMetrics()
	if err != nil {
		return err
	}
	containers, err := collectContainers()
	if err != nil {
		// docker pode nao estar disponivel
		containers = []ContainerStatus{}
	}

	payload := Payload{
		Token:      cfg.Token,
		Metrics:    metrics,
		Containers: containers,
	}

	return sendPayload(cfg.ApiURL, payload)
}

func sendPayload(apiURL string, payload Payload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("api error: %s", string(b))
	}

	return nil
}

func collectMetrics() (Metrics, error) {
	cpu, err := cpuUsageFromTop()
	if err != nil {
		cpu = 0
	}

	cpuCores := getCPUCores()
	memTotal, memAvail, memUsed, memPercent := getMemoryInfo()
	diskTotal, diskUsed, diskPercent := getDiskInfo()
	load1, load5, load15 := getLoadAverage()

	return Metrics{
		CPUUsage:        cpu,
		CPUCores:        cpuCores,
		MemoryTotalMB:   memTotal,
		MemoryAvailMB:   memAvail,
		MemoryUsedMB:    memUsed,
		MemoryPercent:   memPercent,
		DiskTotalGB:     diskTotal,
		DiskUsedGB:      diskUsed,
		DiskPercent:     diskPercent,
		LoadAvg1:        load1,
		LoadAvg5:        load5,
		LoadAvg15:       load15,
	}, nil
}

func cpuUsageFromTop() (float64, error) {
	out, err := exec.Command("sh", "-c", "top -bn1 | grep 'Cpu(s)'").Output()
	if err != nil {
		return 0, err
	}
	line := string(out)
	// Exemplo: %Cpu(s):  2.3 us,  1.0 sy,  0.0 ni, 96.4 id,  0.2 wa...
	parts := strings.Fields(line)
	if len(parts) < 2 {
		return 0, errors.New("unexpected top output")
	}

	var us, sy float64
	for i, p := range parts {
		if strings.HasPrefix(p, "us") && i > 0 {
			us = parseFloat(parts[i-1])
		}
		if strings.HasPrefix(p, "sy") && i > 0 {
			sy = parseFloat(parts[i-1])
		}
	}

	return us + sy, nil
}

func getCPUCores() int {
	out, err := exec.Command("sh", "-c", "nproc").Output()
	if err != nil {
		return 0
	}
	cores := parseInt64(strings.TrimSpace(string(out)))
	return int(cores)
}

func getMemoryInfo() (total, avail, used int64, percent float64) {
	// free -m output:
	//               total        used        free      shared  buff/cache   available
	// Mem:           3911        1540         114         123        2255        1999
	out, err := exec.Command("sh", "-c", "free -m | awk '/Mem:/ { print $2, $3, $7 }'").Output()
	if err != nil {
		return 0, 0, 0, 0
	}
	fields := strings.Fields(strings.TrimSpace(string(out)))
	if len(fields) < 3 {
		return 0, 0, 0, 0
	}
	total = parseInt64(fields[0])
	used = parseInt64(fields[1])
	avail = parseInt64(fields[2])
	if total > 0 {
		percent = float64(used) / float64(total) * 100
	}
	return
}

func getDiskInfo() (totalGB, usedGB, percent float64) {
	// df output: Filesystem Size Used Avail Use% Mounted
	out, err := exec.Command("sh", "-c", "df -BG / | awk 'NR==2 { gsub(\"G\",\"\"); print $2, $3, $5 }'").Output()
	if err != nil {
		return 0, 0, 0
	}
	fields := strings.Fields(strings.TrimSpace(string(out)))
	if len(fields) < 3 {
		return 0, 0, 0
	}
	totalGB = parseFloat(fields[0])
	usedGB = parseFloat(fields[1])
	percent = parsePercent(fields[2])
	return
}

func getLoadAverage() (load1, load5, load15 float64) {
	out, err := exec.Command("sh", "-c", "cat /proc/loadavg | awk '{ print $1, $2, $3 }'").Output()
	if err != nil {
		return 0, 0, 0
	}
	fields := strings.Fields(strings.TrimSpace(string(out)))
	if len(fields) < 3 {
		return 0, 0, 0
	}
	load1 = parseFloat(fields[0])
	load5 = parseFloat(fields[1])
	load15 = parseFloat(fields[2])
	return
}

func collectContainers() ([]ContainerStatus, error) {
	out, err := exec.Command("sh", "-c", "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}'").Output()
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	containerMap := make(map[string]ContainerStatus)

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 5)
		if len(parts) < 2 {
			continue
		}
		id := strings.TrimSpace(parts[0])
		name := strings.TrimSpace(parts[1])
		image := ""
		state := ""
		status := ""
		if len(parts) > 2 {
			image = strings.TrimSpace(parts[2])
		}
		if len(parts) > 3 {
			state = strings.TrimSpace(parts[3])
		}
		if len(parts) > 4 {
			status = strings.TrimSpace(parts[4])
		}
		containerMap[name] = ContainerStatus{
			ID:     id,
			Name:   name,
			Image:  image,
			State:  state,
			Status: status,
		}
	}

	stats, statsErr := exec.Command("sh", "-c", "docker stats --no-stream --all --format '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}'").Output()
	if statsErr == nil {
		statLines := strings.Split(strings.TrimSpace(string(stats)), "\n")
		for _, line := range statLines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.SplitN(line, "|", 8)
			if len(parts) < 2 {
				continue
			}
			id := strings.TrimSpace(parts[0])
			name := strings.TrimSpace(parts[1])
			cpu := 0.0
			memUsage := ""
			memPercent := 0.0
			netIO := ""
			blockIO := ""
			var pids int64

			if len(parts) > 2 {
				cpu = parsePercent(parts[2])
			}
			if len(parts) > 3 {
				memUsage = strings.TrimSpace(parts[3])
			}
			if len(parts) > 4 {
				memPercent = parsePercent(parts[4])
			}
			if len(parts) > 5 {
				netIO = strings.TrimSpace(parts[5])
			}
			if len(parts) > 6 {
				blockIO = strings.TrimSpace(parts[6])
			}
			if len(parts) > 7 {
				pids = parseInt64(parts[7])
			}

			entry := containerMap[name]
			entry.ID = id
			entry.Name = name
			entry.CPUPercent = cpu
			entry.MemUsage = memUsage
			entry.MemPercent = memPercent
			entry.NetIO = netIO
			entry.BlockIO = blockIO
			entry.PIDs = pids
			containerMap[name] = entry
		}
	}

	containers := make([]ContainerStatus, 0, len(containerMap))
	for _, entry := range containerMap {
		containers = append(containers, entry)
	}
	return containers, nil
}

func installAgent(cfg Config, configPath string) error {
	if err := ensureDir(filepath.Dir(configPath)); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(configPath, payload, 0o600); err != nil {
		return err
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	target := "/usr/local/bin/vaultrix-agent"
	if err := copyFile(exe, target); err != nil {
		return err
	}
	if err := os.Chmod(target, 0o755); err != nil {
		return err
	}

	cron := fmt.Sprintf("*/%d * * * * root %s --once --config %s\n", cfg.Interval, target, configPath)
	if err := os.WriteFile(cronPath, []byte(cron), 0o644); err != nil {
		return err
	}

	_ = runOnce(cfg)
	return nil
}

func loadConfig(path string) (Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return Config{}, err
	}
	return cfg, validateConfig(cfg)
}

func validateConfig(cfg Config) error {
	if cfg.Token == "" {
		return errors.New("token is required")
	}
	if cfg.ApiURL == "" {
		return errors.New("api-url is required")
	}
	if cfg.Interval < 1 {
		cfg.Interval = 1
	}
	return nil
}

func parseFloat(value string) float64 {
	value = strings.ReplaceAll(value, ",", ".")
	var f float64
	fmt.Sscanf(value, "%f", &f)
	return f
}

func parsePercent(value string) float64 {
	value = strings.TrimSpace(strings.TrimSuffix(value, "%"))
	return parseFloat(value)
}

func parseInt64(value string) int64 {
	value = strings.TrimSpace(value)
	var v int64
	fmt.Sscanf(value, "%d", &v)
	return v
}

func ensureDir(path string) error {
	if path == "" {
		return nil
	}
	return os.MkdirAll(path, 0o755)
}

func copyFile(src, dst string) error {
	input, err := os.Open(src)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer output.Close()

	if _, err := io.Copy(output, input); err != nil {
		return err
	}

	return output.Sync()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err.Error())
	os.Exit(1)
}
