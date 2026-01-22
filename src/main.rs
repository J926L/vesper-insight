mod models;

use anyhow::{Context, Result};
use chrono::Utc;
use models::NetworkFlow;
use pcap::{Capture, Device};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use std::time::Duration;
// use tokio::time::sleep; (unused)

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    println!("Starting Vesper-Backend Ingestion...");

    let kafka_broker =
        std::env::var("KAFKA_BROKER").unwrap_or_else(|_| "localhost:19092".to_string());

    // 1. Initialize Kafka Producer
    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", &kafka_broker)
        .set("message.timeout.ms", "5000")
        .create()
        .context("Failed to create Kafka producer")?;

    println!("Kafka producer initialized ({})", kafka_broker);

    // 2. Initialize Packet Capture
    // For WSL2, we usually want eth0 or any available device.
    let device = Device::lookup()
        .context("Failed to lookup default device")?
        .context("No device found")?;

    println!("Capturing on device: {}", device.name);

    let mut cap = Capture::from_device(device)
        .context("Failed to open device for capture")?
        .promisc(true)
        .snaplen(65535)
        .timeout(10)
        .open()
        .context("Failed to start pcap capture")?;

    let link_type = cap.get_datalink();
    println!("Datalink type: {:?}", link_type);

    // 3. Ingestion Loop
    while let Ok(packet) = cap.next_packet() {
        let mut src_ip = "unknown".to_string();
        let mut dst_ip = "unknown".to_string();
        let mut src_port = 0;
        let mut dst_port = 0;
        let mut proto = "OTHER".to_string();

        let headers = match link_type {
            pcap::Linktype::ETHERNET => etherparse::PacketHeaders::from_ethernet_slice(packet.data),
            pcap::Linktype::LINUX_SLL => {
                // Linux Cooked captures have a 16-byte header instead of 14-byte Ethernet
                etherparse::PacketHeaders::from_ip_slice(&packet.data[16..])
            }
            pcap::Linktype::NULL => {
                // Loopback on some systems (4-byte header)
                etherparse::PacketHeaders::from_ip_slice(&packet.data[4..])
            }
            _ => {
                // Fallback to trying as Ethernet
                etherparse::PacketHeaders::from_ethernet_slice(packet.data)
            }
        };

        if let Ok(value) = headers {
            if let Some(net) = value.net {
                match net {
                    etherparse::NetHeaders::Ipv4(ipv4, _) => {
                        src_ip = std::net::Ipv4Addr::from(ipv4.source).to_string();
                        dst_ip = std::net::Ipv4Addr::from(ipv4.destination).to_string();
                    }
                    etherparse::NetHeaders::Ipv6(ipv6, _) => {
                        src_ip = std::net::Ipv6Addr::from(ipv6.source).to_string();
                        dst_ip = std::net::Ipv6Addr::from(ipv6.destination).to_string();
                    }
                    _ => {}
                }
            }
            if let Some(transport) = value.transport {
                match transport {
                    etherparse::TransportHeader::Tcp(tcp) => {
                        proto = "TCP".to_string();
                        src_port = tcp.source_port;
                        dst_port = tcp.destination_port;
                    }
                    etherparse::TransportHeader::Udp(udp) => {
                        proto = "UDP".to_string();
                        src_port = udp.source_port;
                        dst_port = udp.destination_port;
                    }
                    _ => {}
                }
            }
        }

        let flow = NetworkFlow::new(
            src_ip,
            dst_ip,
            src_port,
            dst_port,
            proto,
            Utc::now().timestamp(),
        );

        let payload = serde_json::to_string(&flow)?;

        // Async Push to Redpanda
        let record = FutureRecord::to("raw_metrics")
            .payload(&payload)
            .key("flow");

        let status = producer.send(record, Duration::from_secs(0)).await;

        match status {
            Ok(_) => println!("Pushed flow to raw_metrics"),
            Err((e, _)) => eprintln!("Failed to push to Kafka: {:?}", e),
        }

        // Throttle for dev loop if needed
        // sleep(Duration::from_millis(100)).await;
    }

    Ok(())
}
