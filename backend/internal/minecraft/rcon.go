package minecraft

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

const (
	packetCommand = int32(2)
	packetAuth    = int32(3)
	maxPacketSize = 4 << 20
)

var ErrUnavailable = errors.New("Minecraft RCON is unavailable")

type Executor interface {
	Exec(context.Context, string) (string, error)
}

type RCONClient struct {
	Integration *Integration
	DialTimeout time.Duration
	IOTimeout   time.Duration
	DialContext func(context.Context, string, string) (net.Conn, error)
}

func (c *RCONClient) Exec(ctx context.Context, command string) (string, error) {
	if strings.ContainsAny(command, "\x00\r\n") || len(command) == 0 || len(command) > 4096 {
		return "", errors.New("invalid Minecraft command")
	}
	credentials := c.Integration.Credentials()
	if credentials.Address == "" || credentials.Password == "" {
		return "", ErrUnavailable
	}
	dialTimeout := c.DialTimeout
	if dialTimeout == 0 {
		dialTimeout = 3 * time.Second
	}
	ioTimeout := c.IOTimeout
	if ioTimeout == 0 {
		ioTimeout = 5 * time.Second
	}
	dialContext := c.DialContext
	if dialContext == nil {
		dialer := net.Dialer{Timeout: dialTimeout}
		dialContext = dialer.DialContext
	}
	connection, err := dialContext(ctx, "tcp", credentials.Address)
	if err != nil {
		return "", fmt.Errorf("%w: connect: %v", ErrUnavailable, err)
	}
	defer connection.Close()
	deadline := time.Now().Add(ioTimeout)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	if err := connection.SetDeadline(deadline); err != nil {
		return "", fmt.Errorf("set RCON deadline: %w", err)
	}
	reader := bufio.NewReader(connection)
	if err := writePacket(connection, 1, packetAuth, credentials.Password); err != nil {
		return "", fmt.Errorf("%w: authenticate: %v", ErrUnavailable, err)
	}
	authID, _, _, err := readPacket(reader)
	if err != nil {
		return "", fmt.Errorf("%w: authenticate response: %v", ErrUnavailable, err)
	}
	if authID == -1 {
		return "", errors.New("Minecraft RCON rejected the configured credentials")
	}
	if err := writePacket(connection, 2, packetCommand, command); err != nil {
		return "", fmt.Errorf("send RCON command: %w", err)
	}
	responseID, _, payload, err := readPacket(reader)
	if err != nil {
		return "", fmt.Errorf("read RCON command response: %w", err)
	}
	if responseID != 2 {
		return "", errors.New("RCON returned an unexpected response identifier")
	}
	return strings.TrimSpace(payload), nil
}

func writePacket(writer io.Writer, id, packetType int32, payload string) error {
	if len(payload) > maxPacketSize-10 {
		return errors.New("RCON payload is too large")
	}
	length := int32(len(payload) + 10)
	buffer := bytes.NewBuffer(make([]byte, 0, length+4))
	for _, value := range []int32{length, id, packetType} {
		if err := binary.Write(buffer, binary.LittleEndian, value); err != nil {
			return err
		}
	}
	buffer.WriteString(payload)
	buffer.Write([]byte{0, 0})
	_, err := writer.Write(buffer.Bytes())
	return err
}

func readPacket(reader io.Reader) (int32, int32, string, error) {
	var length int32
	if err := binary.Read(reader, binary.LittleEndian, &length); err != nil {
		return 0, 0, "", err
	}
	if length < 10 || length > maxPacketSize {
		return 0, 0, "", errors.New("RCON packet length is invalid")
	}
	packet := make([]byte, length)
	if _, err := io.ReadFull(reader, packet); err != nil {
		return 0, 0, "", err
	}
	id := int32(binary.LittleEndian.Uint32(packet[0:4]))
	packetType := int32(binary.LittleEndian.Uint32(packet[4:8]))
	if packet[len(packet)-2] != 0 || packet[len(packet)-1] != 0 {
		return 0, 0, "", errors.New("RCON packet terminator is invalid")
	}
	return id, packetType, string(packet[8 : len(packet)-2]), nil
}
