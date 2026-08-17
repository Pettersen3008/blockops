package minecraft

import (
	"bufio"
	"context"
	"net"
	"testing"
	"time"
)

func TestRCONClientAuthenticatesAndExecutes(t *testing.T) {
	t.Parallel()
	clientConnection, serverConnection := net.Pipe()
	serverDone := make(chan error, 1)
	go func() {
		defer serverConnection.Close()
		reader := bufio.NewReader(serverConnection)
		id, packetType, password, readErr := readPacket(reader)
		if readErr != nil {
			serverDone <- readErr
			return
		}
		if id != 1 || packetType != packetAuth || password != "private-test-password" {
			serverDone <- &protocolError{"unexpected auth packet"}
			return
		}
		if writeErr := writePacket(serverConnection, 1, 2, ""); writeErr != nil {
			serverDone <- writeErr
			return
		}
		id, packetType, command, readErr := readPacket(reader)
		if readErr != nil {
			serverDone <- readErr
			return
		}
		if id != 2 || packetType != packetCommand || command != "list" {
			serverDone <- &protocolError{"unexpected command packet"}
			return
		}
		serverDone <- writePacket(serverConnection, 2, 0, "There are 0 of a max of 20 players online:")
	}()
	integration, err := NewIntegration(context.Background(), nil, nil, Credentials{Address: "minecraft:25575", Password: "private-test-password"})
	if err != nil {
		t.Fatal(err)
	}
	client := RCONClient{Integration: integration, DialTimeout: time.Second, IOTimeout: time.Second, DialContext: func(context.Context, string, string) (net.Conn, error) { return clientConnection, nil }}
	response, err := client.Exec(context.Background(), "list")
	if err != nil {
		t.Fatal(err)
	}
	if response != "There are 0 of a max of 20 players online:" {
		t.Fatalf("unexpected response %q", response)
	}
	if err := <-serverDone; err != nil {
		t.Fatal(err)
	}
}

type protocolError struct{ message string }

func (e *protocolError) Error() string { return e.message }
