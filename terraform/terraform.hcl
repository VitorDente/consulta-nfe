variable "project" {}
variable "region"  { default = "us-central1" }

resource "google_cloud_run_service" "consulta_nfe" {
  name     = "consulta-nfe"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project}/consulta-nfe:latest"
        resources {
          limits = {
            cpu    = "2"
            memory = "1Gi"
          }
        }
        env = [
          { name = "GOOGLE_CLOUD_PROJECT", value = var.project }
        ]
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_secret_manager_secret" "cert" {
  name       = "cert-a1"
  replication { automatic = true }
}

resource "google_secret_manager_secret_version" "cert_version" {
  secret      = google_secret_manager_secret.cert.id
  secret_data = filebase64("${path.module}/cert-a1.p12") + "||" + var.cert_pass
}
